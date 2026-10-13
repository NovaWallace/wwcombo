"""Verify the separate Windows core and all-DLC archives before delivery."""

import hashlib
import json
import sys
from pathlib import Path
from zipfile import ZipFile


def file_entries(archive):
    entries = {}
    for info in archive.infolist():
        name = info.filename.replace("\\", "/")
        if name.endswith("/"):
            continue
        if name.startswith("/") or ".." in name.split("/") or name in entries:
            raise ValueError(f"Unsafe or duplicate ZIP entry: {name}")
        entries[name] = info
    return entries


def read(archive, entries, name):
    return archive.read(entries[name])


def verify_checksums(archive, entries, checksum_name):
    lines = read(archive, entries, checksum_name).decode("utf-8-sig").splitlines()
    expected = {}
    for line in lines:
        digest, relative = line.split("  ", 1)
        expected[relative.replace("\\", "/")] = digest.lower()
    names = set(entries) - {checksum_name}
    prefix = checksum_name.rsplit("/", 1)[0] + "/" if "/" in checksum_name else ""
    if set(expected) != {name.removeprefix(prefix) for name in names}:
        raise ValueError("SHA256SUMS does not cover exactly the ZIP files")
    for name in names:
        digest = hashlib.sha256()
        with archive.open(entries[name]) as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected[name.removeprefix(prefix)]:
            raise ValueError(f"Checksum mismatch: {name}")
    return len(names)


def verify_core(path):
    root = path.stem + "/"
    with ZipFile(path) as archive:
        entries = file_entries(archive)
        if root + "wwcombo.exe" not in entries:
            raise ValueError("Core executable is missing")
        if read(archive, entries, root + "README.txt").decode("utf-8-sig").strip() != "管理员模式运行wwcombo即可":
            raise ValueError("Core README.txt does not contain the requested text")
        count = verify_checksums(archive, entries, root + "SHA256SUMS.txt")
        print(f"Core: {count} files verified, README.txt and wwcombo.exe present")


def verify_dlc(path, source_manifest):
    with ZipFile(path) as archive:
        entries = file_entries(archive)
        if read(archive, entries, "README.txt").decode("utf-8-sig").strip() != "管理员模式运行wwcombo即可":
            raise ValueError("DLC README.txt does not contain the requested text")
        for name, minimum_size in (
            ("wwcombo dlc/ffmpeg/ffmpeg.exe", 100_000_000),
            ("wwcombo dlc/simulated-input/simulated-input-dlc.exe", 100_000),
        ):
            if name not in entries or entries[name].file_size < minimum_size:
                raise ValueError(f"DLC executable missing or truncated: {name}")
        for folder, kind in (("ffmpeg", "wwcombo-ffmpeg"), ("simulated-input", "wwcombo-simulated-input")):
            name = f"wwcombo dlc/{folder}/manifest.json"
            if json.loads(read(archive, entries, name).decode("utf-8-sig"))["type"] != kind:
                raise ValueError(f"Invalid DLC manifest: {name}")
        manifests = [name for name in entries if name.startswith("wwcombo dlc/live2d/") and name.endswith("/manifest.json")]
        expected_ids = {character["id"] for character in json.loads(source_manifest.read_text(encoding="utf-8"))["characters"]}
        found_ids = set()
        for name in manifests:
            manifest = json.loads(read(archive, entries, name).decode("utf-8-sig"))
            found_ids.add(manifest["id"])
            folder = name.rsplit("/", 1)[0]
            for kind in ("skeleton", "atlas", "texture"):
                relative = manifest[kind].replace("\\", "/")
                if not relative.startswith("assets/") or ".." in relative.split("/") or folder + "/" + relative not in entries:
                    raise ValueError(f"Invalid {kind} asset for {manifest['id']}")
        if found_ids != expected_ids or len(manifests) != len(expected_ids):
            raise ValueError(f"Live2D character mismatch: {len(found_ids)} / {len(expected_ids)}")
        count = verify_checksums(archive, entries, "SHA256SUMS.txt")
        print(f"DLC: {count} files verified, FFmpeg, simulation, and {len(manifests)} Live2D characters present")


if __name__ == "__main__":
    verify_core(Path(sys.argv[1]))
    verify_dlc(Path(sys.argv[2]), Path(sys.argv[3]))
