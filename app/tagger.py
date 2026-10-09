"""High-fidelity ID3v2 metadata tagging and album cover embedding."""
from pathlib import Path

from .logger import log_error


def tag_mp3_file(
    file_path: str,
    title: str,
    artist: str,
    album: str,
    track_num: int = 1,
    total_tracks: int = 1,
    year: str = "",
    genre: str = "Music",
    cover_path: str = "",
    lyrics: str = ""
) -> bool:
    """Embed comprehensive ID3 tags (Title, Artist, Album, Year, Track, Genre, Art, Lyrics)."""
    try:
        from mutagen.id3 import (
            APIC,
            ID3,
            TALB,
            TCON,
            TDRC,
            TIT2,
            TPE1,
            TRCK,
            USLT,
            ID3NoHeaderError
        )

        p = Path(file_path)
        if not p.exists() or not p.is_file():
            return False

        try:
            audio = ID3(str(p))
        except ID3NoHeaderError:
            audio = ID3()

        if title:
            audio["TIT2"] = TIT2(encoding=3, text=title)
        if artist:
            audio["TPE1"] = TPE1(encoding=3, text=artist)
        if album:
            audio["TALB"] = TALB(encoding=3, text=album)
        if track_num:
            t_str = (
                f"{track_num}/{total_tracks}"
                if total_tracks else str(track_num)
            )
            audio["TRCK"] = TRCK(encoding=3, text=t_str)
        if year:
            audio["TDRC"] = TDRC(encoding=3, text=str(year))
        if genre:
            audio["TCON"] = TCON(encoding=3, text=genre)
        if lyrics:
            audio["USLT::eng"] = USLT(encoding=3, lang="eng", desc="", text=lyrics)

        # Embed front album art if cover.jpg exists
        if cover_path and Path(cover_path).exists():
            try:
                with open(cover_path, "rb") as img_f:
                    img_data = img_f.read()
                mime = (
                    "image/jpeg"
                    if cover_path.lower().endswith((".jpg", ".jpeg"))
                    else "image/png"
                )
                audio["APIC"] = APIC(
                    encoding=3,
                    mime=mime,
                    type=3,  # 3 is for album front cover
                    desc="Cover",
                    data=img_data
                )
            except Exception as e:
                log_error(f"Failed to embed cover art in {p.name}: {e}")

        audio.save(str(p), v2_version=3)
        return True
    except Exception as e:
        log_error(f"ID3 Tagging failed for {file_path}: {e}")
        return False
