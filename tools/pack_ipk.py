#!/usr/bin/env python3
"""Pack a webOS .ipk (opkg/GNU-ar layout) for the Homebrew Channel, plus the
package manifest the channel polls. Dependency-free (stdlib only).

Layout verified against webosbrew/vncserver's released ipk and webosose ares-cli:
  <id>_<ver>_all.ipk  = GNU ar: debian-binary | control.tar.gz | data.tar.gz
  data.tar.gz         = usr/palm/applications/<id>/...
No signature is needed for rooted/devmode installs."""
import argparse, hashlib, io, json, os, stat, tarfile


def tar_gz_from_tree(stagedir, prefix):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tf:
        for root, dirs, files in os.walk(stagedir):
            dirs.sort()
            for name in sorted(dirs + files):
                path = os.path.join(root, name)
                rel = os.path.relpath(path, stagedir)
                arcname = prefix + "/" + rel.replace(os.sep, "/")
                ti = tf.gettarinfo(path, arcname=arcname)
                ti.uid = ti.gid = 0
                ti.uname = ti.gname = "root"
                ti.mtime = 0  # reproducible
                if os.path.islink(path):
                    ti.mode = 0o777
                elif os.path.isdir(path):
                    ti.mode = 0o755
                elif name.endswith(".sh") or (os.stat(path).st_mode & stat.S_IXUSR):
                    ti.mode = 0o755
                else:
                    ti.mode = 0o644
                if ti.isfile():
                    with open(path, "rb") as f:
                        tf.addfile(ti, f)
                else:
                    tf.addfile(ti)
    return buf.getvalue()


def tar_gz_single(name, data):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tf:
        ti = tarfile.TarInfo(name)
        ti.size = len(data)
        ti.mode = 0o644
        ti.mtime = 0
        tf.addfile(ti, io.BytesIO(data))
    return buf.getvalue()


def ar(members):
    out = [b"!<arch>\n"]
    for name, data in members:
        hdr = "%-16s%-12d%-6d%-6d%-8o%-10d`\n" % (name, 0, 0, 0, 100644, len(data))
        out.append(hdr.encode())
        out.append(data)
        if len(data) % 2:
            out.append(b"\n")
    return b"".join(out)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--stagedir", required=True, help="app payload dir (index.html, bin/, ...)")
    p.add_argument("--id", required=True)
    p.add_argument("--version", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--description", default="")
    p.add_argument("--maintainer", required=True)
    p.add_argument("--icon-uri", required=True)
    p.add_argument("--source-url", required=True)
    p.add_argument("--dist", required=True)
    a = p.parse_args()

    os.makedirs(a.dist, exist_ok=True)
    prefix = "usr/palm/applications/" + a.id

    data = tar_gz_from_tree(a.stagedir, prefix)
    installed_kb = sum(
        (os.path.getsize(os.path.join(r, f)) + 1023) // 1024
        for r, _, fs in os.walk(a.stagedir) for f in fs
    )
    control = (
        f"Package: {a.id}\nVersion: {a.version}\nSection: misc\nPriority: optional\n"
        f"Architecture: all\nInstalled-Size: {installed_kb}\nMaintainer: {a.maintainer}\n"
        f"Description: {a.description or a.title}\n"
        "webOS-Package-Format-Version: 2\nwebOS-Packager-Version: webos-snapclient\n"
    ).encode()
    ipk_name = f"{a.id}_{a.version}_all.ipk"
    ipk_path = os.path.join(a.dist, ipk_name)
    with open(ipk_path, "wb") as f:
        f.write(ar([("debian-binary", b"2.0\n"),
                    ("control.tar.gz", tar_gz_single("control", control)),
                    ("data.tar.gz", data)]))

    sha = hashlib.sha256(open(ipk_path, "rb").read()).hexdigest()
    manifest = {
        "id": a.id,
        "version": a.version,
        "type": "web",
        "title": a.title,
        "appDescription": a.description or a.title,
        "iconUri": a.icon_uri,
        "sourceUrl": a.source_url,
        "rootRequired": True,
        # relative basename: Homebrew Channel resolves it against the manifest URL,
        # which is why ipk + manifest are co-published in one GitHub release
        "ipkUrl": ipk_name,
        "ipkHash": {"sha256": sha},
    }
    manifest_path = os.path.join(a.dist, f"{a.id}.manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"ipk:       {ipk_path} ({os.path.getsize(ipk_path)} bytes, sha256 {sha})")
    print(f"manifest:  {manifest_path}")


if __name__ == "__main__":
    main()
