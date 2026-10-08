"""Artist alias mappings and stylization normalizers for special artist names."""
import re
from .overrides import get_artist_aliases


class _DynamicArtistAliases(dict):
    """Dictionary-like proxy that always queries current dynamic overrides."""

    def __getitem__(self, key):
        return get_artist_aliases().get(key, key)

    def get(self, key, default=None):
        return get_artist_aliases().get(key, default)

    def __contains__(self, key):
        return key in get_artist_aliases()

    def items(self):
        return get_artist_aliases().items()

    def keys(self):
        return get_artist_aliases().keys()

    def values(self):
        return get_artist_aliases().values()


ARTIST_ALIASES = _DynamicArtistAliases()


def normalize_artist_slug(name: str) -> str:
    """Normalize names stripping punctuation and stylized leetspeak letters."""
    if not name:
        return ""
    n = name.lower().strip()
    # Replace stylized leetspeak letters (e.g. P!nk -> Pink, Ke$ha -> Kesha)
    n = re.sub(r"(?<=\w)!(?=\w)", "i", n)
    n = n.replace("!", "").replace("$", "s").replace("@", "a").replace("&", "and")
    return re.sub(r"[^\w\s]", "", n).strip()
