import argparse
import os
import shutil
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Iterable, List, Optional, Set, Tuple


@dataclass
class Mp4Report:
    path: Path
    size: int
    major_brand: Optional[str]
    compatible_brands: List[str]
    moov_offset: Optional[int]
    mdat_offset: Optional[int]
    sample_entry_types: Set[str]


CONTAINER_BOXES = {
    # ISO BMFF containers commonly found in MP4
    "moov",
    "trak",
    "mdia",
    "minf",
    "stbl",
    "edts",
    "dinf",
    "udta",
    "mvex",
    "moof",
    "traf",
    "mfra",
    "tref",
    "ipro",
    "sinf",
    "schi",
    "meco",
    "mere",
    "meta",  # container but has a FullBox header first
    "ilst",
}

SKIP_BOXES = {"mdat", "free", "skip", "wide"}


def _read_u32(f: BinaryIO) -> int:
    data = f.read(4)
    if len(data) != 4:
        raise EOFError
    return struct.unpack(">I", data)[0]


def _read_u64(f: BinaryIO) -> int:
    data = f.read(8)
    if len(data) != 8:
        raise EOFError
    return struct.unpack(">Q", data)[0]


def _read_fourcc(f: BinaryIO) -> str:
    data = f.read(4)
    if len(data) != 4:
        raise EOFError
    try:
        return data.decode("ascii", errors="replace")
    except Exception:
        return "????"


def _read_box_header(f: BinaryIO, file_end: int) -> Optional[Tuple[int, str, int, int]]:
    """Returns (size, type, header_size, box_start) or None if at end."""
    box_start = f.tell()
    if box_start >= file_end:
        return None

    try:
        size32 = _read_u32(f)
        box_type = _read_fourcc(f)
    except EOFError:
        return None

    header_size = 8
    if size32 == 1:
        # 64-bit size
        size = _read_u64(f)
        header_size = 16
    elif size32 == 0:
        # extends to EOF
        size = file_end - box_start
    else:
        size = size32

    if size < header_size:
        # Corrupt box; stop parsing
        return None

    return size, box_type, header_size, box_start


def _parse_ftyp(f: BinaryIO, payload_start: int, payload_end: int) -> Tuple[Optional[str], List[str]]:
    f.seek(payload_start)
    if payload_end - payload_start < 8:
        return None, []

    major = f.read(4).decode("ascii", errors="replace")
    _minor = f.read(4)  # minor_version

    remaining = payload_end - f.tell()
    brands = []
    while remaining >= 4:
        b = f.read(4).decode("ascii", errors="replace")
        brands.append(b)
        remaining -= 4
    return major, brands


def _parse_stsd(f: BinaryIO, payload_start: int, payload_end: int) -> Set[str]:
    """Parse sample descriptions to extract codec fourcc types (avc1, hvc1, mp4a, etc.)."""
    f.seek(payload_start)
    if payload_end - payload_start < 8:
        return set()

    # FullBox: version(1) + flags(3)
    _vf = f.read(4)
    try:
        entry_count = _read_u32(f)
    except EOFError:
        return set()

    found: Set[str] = set()
    for _ in range(entry_count):
        entry_start = f.tell()
        if payload_end - entry_start < 8:
            break
        try:
            entry_size = _read_u32(f)
            entry_type = _read_fourcc(f)
        except EOFError:
            break

        found.add(entry_type)

        # Skip rest of this entry
        if entry_size < 8:
            break
        f.seek(entry_start + entry_size)

    return found


def _walk_boxes(
    f: BinaryIO,
    start: int,
    end: int,
    report_sample_types: Set[str],
    depth: int = 0,
) -> None:
    if depth > 32:
        return

    f.seek(start)
    while f.tell() < end:
        hdr = _read_box_header(f, end)
        if hdr is None:
            return
        size, box_type, header_size, box_start = hdr
        box_end = box_start + size

        payload_start = box_start + header_size
        payload_end = box_end

        # Guard against invalid sizes
        if box_end > end:
            return

        # meta is a container but begins with FullBox header
        if box_type == "meta":
            # meta payload begins with 4 bytes version/flags
            if payload_end - payload_start >= 4:
                _ = f.read(4)
                _walk_boxes(f, f.tell(), payload_end, report_sample_types, depth + 1)
            else:
                f.seek(box_end)
            continue

        if box_type == "stsd":
            report_sample_types |= _parse_stsd(f, payload_start, payload_end)
            f.seek(box_end)
            continue

        if box_type in SKIP_BOXES:
            f.seek(box_end)
            continue

        if box_type in CONTAINER_BOXES:
            _walk_boxes(f, payload_start, payload_end, report_sample_types, depth + 1)
            f.seek(box_end)
            continue

        # Default: skip
        f.seek(box_end)


def inspect_mp4(path: Path) -> Mp4Report:
    size = path.stat().st_size
    major_brand: Optional[str] = None
    compatible_brands: List[str] = []
    moov_offset: Optional[int] = None
    mdat_offset: Optional[int] = None
    sample_entry_types: Set[str] = set()

    with path.open("rb") as f:
        file_end = size
        pos = 0
        while pos < file_end:
            f.seek(pos)
            hdr = _read_box_header(f, file_end)
            if hdr is None:
                break
            box_size, box_type, header_size, box_start = hdr
            box_end = box_start + box_size
            payload_start = box_start + header_size
            payload_end = box_end

            if box_type == "ftyp":
                major_brand, compatible_brands = _parse_ftyp(f, payload_start, payload_end)
            elif box_type == "moov":
                moov_offset = box_start
                _walk_boxes(f, payload_start, payload_end, sample_entry_types)
            elif box_type == "mdat":
                mdat_offset = box_start

            # Stop if box size looks invalid
            if box_size <= 0:
                break

            pos = box_end

    return Mp4Report(
        path=path,
        size=size,
        major_brand=major_brand,
        compatible_brands=compatible_brands,
        moov_offset=moov_offset,
        mdat_offset=mdat_offset,
        sample_entry_types=sample_entry_types,
    )


def is_faststart(rep: Mp4Report) -> Optional[bool]:
    if rep.moov_offset is None or rep.mdat_offset is None:
        return None
    return rep.moov_offset < rep.mdat_offset


def classify_ios_compat(rep: Mp4Report) -> List[str]:
    """Return warnings (empty means 'looks ok' at container/codec-id level)."""
    warnings: List[str] = []

    fast = is_faststart(rep)
    if fast is False:
        warnings.append("moov-after-mdat (not faststart)")

    # Codec identifiers found in stsd entries
    t = rep.sample_entry_types

    # Video codec hints
    if any(x in t for x in {"hvc1", "hev1", "dvhe", "dvh1"}):
        warnings.append("video=HEVC/DolbyVision (may fail on older iOS devices)")
    if "avc1" not in t and any(x in t for x in {"hvc1", "hev1", "av01", "vp09"}):
        warnings.append("no avc1 found (H.264 is safest for iOS)")
    if "av01" in t or "vp09" in t:
        warnings.append("video=AV1/VP9 in MP4 (often unsupported on iOS Safari)")

    # Audio codec hints
    if any(x in t for x in {"ac-3", "ec-3"}):
        warnings.append("audio=AC-3/E-AC-3 (often unsupported on Safari)")
    if "mp4a" not in t and any(x in t for x in {"ac-3", "ec-3", "Opus", "opus"}):
        warnings.append("no mp4a found (AAC is safest for iOS)")

    if rep.major_brand is None:
        warnings.append("missing ftyp")

    return warnings


def iter_mp4_files(assets_dir: Path) -> Iterable[Path]:
    for p in assets_dir.rglob("*.mp4"):
        if p.is_file():
            yield p


def _has_existing_hls_outputs(mp4_path: Path) -> bool:
    playlist = mp4_path.with_suffix(".m3u8")
    if not playlist.exists():
        return False
    stem = mp4_path.stem
    segs = list(mp4_path.parent.glob(f"{stem}_*.ts"))
    return len(segs) > 0


def convert_mp4_to_hls(
    mp4_path: Path,
    *,
    hls_time: int = 4,
    force: bool = False,
    transcode: bool = False,
) -> None:
    """Convert a single MP4 to HLS outputs next to the MP4.

    Produces:
      - <stem>.m3u8
      - <stem>_000.ts, <stem>_001.ts, ...
    """
    if not mp4_path.exists() or not mp4_path.is_file():
        return

    if not force and _has_existing_hls_outputs(mp4_path):
        return

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found in PATH. Please install ffmpeg and ensure 'ffmpeg' is available.")

    playlist_path = mp4_path.with_suffix(".m3u8")
    stem = mp4_path.stem
    segment_pattern = (mp4_path.parent / f"{stem}_%03d.ts").as_posix()

    cmd: List[str] = [
        ffmpeg,
        "-hide_banner",
        "-y" if force else "-n",
        "-i",
        str(mp4_path),
    ]

    if transcode:
        # Safer for iOS hardware decode (at the cost of time/quality).
        cmd += [
            "-c:v",
            "h264",
            "-profile:v",
            "main",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
        ]
    else:
        # Fast path: remux into HLS segments without re-encoding.
        cmd += [
            "-c",
            "copy",
            # Helps when remuxing H.264 from MP4 to MPEG-TS.
            "-bsf:v",
            "h264_mp4toannexb",
        ]

    cmd += [
        "-hls_time",
        str(hls_time),
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments",
        "-hls_segment_filename",
        segment_pattern,
        str(playlist_path),
    ]

    subprocess.run(cmd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect MP4 structure for iOS/Safari compatibility.")
    parser.add_argument("--assets", default="assets", help="Assets directory to scan")
    parser.add_argument(
        "--to-hls",
        action="store_true",
        help="Convert all discovered .mp4 files to HLS outputs (.m3u8 + .ts segments) next to each MP4",
    )
    parser.add_argument("--hls-time", type=int, default=4, help="HLS segment duration in seconds (default: 4)")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing .m3u8/.ts outputs (default: skip if outputs already exist)",
    )
    parser.add_argument(
        "--transcode",
        action="store_true",
        help="Transcode to H.264/AAC for maximum iOS compatibility (slower). Default is stream copy.",
    )
    args = parser.parse_args()

    root = Path(args.assets)
    if not root.exists():
        print(f"Assets directory not found: {root}")
        return 2

    mp4_files = sorted(iter_mp4_files(root))
    if not mp4_files:
        print("No .mp4 files found.")
        return 1

    if args.to_hls:
        converted = 0
        skipped = 0
        failed = 0

        for p in mp4_files:
            rel = p.relative_to(root).as_posix() if p.is_absolute() else p.as_posix()
            try:
                if not args.force and _has_existing_hls_outputs(p):
                    print(f"SKIP  {rel} (HLS outputs already exist)")
                    skipped += 1
                    continue
                print(f"HLS   {rel}")
                convert_mp4_to_hls(p, hls_time=args.hls_time, force=args.force, transcode=args.transcode)
                converted += 1
            except subprocess.CalledProcessError as e:
                print(f"FAIL  {rel} (ffmpeg exit code {e.returncode})")
                failed += 1
            except Exception as e:
                print(f"FAIL  {rel} ({e})")
                failed += 1

        print(f"\nDone. converted={converted}, skipped={skipped}, failed={failed}")
        return 0 if failed == 0 else 3

    reports = [inspect_mp4(p) for p in mp4_files]

    for rep in reports:
        fast = is_faststart(rep)
        fast_s = "unknown"
        if fast is True:
            fast_s = "faststart"
        elif fast is False:
            fast_s = "NOT-faststart"

        warnings = classify_ios_compat(rep)
        warn_s = "OK" if not warnings else "WARN: " + "; ".join(warnings)

        brands = []
        if rep.major_brand:
            brands.append(rep.major_brand)
        brands.extend(rep.compatible_brands)
        brands_s = ",".join(brands) if brands else "-"

        types_s = ",".join(sorted(rep.sample_entry_types)) if rep.sample_entry_types else "-"

        rel = rep.path.as_posix()
        print(f"{rel}\n  size={rep.size} bytes\n  brands={brands_s}\n  {fast_s} (moov={rep.moov_offset}, mdat={rep.mdat_offset})\n  stsd={types_s}\n  {warn_s}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
