"""Curated discovery seeds and landmark definitions for historical musical decades."""
from .overrides import get_decade_landmarks, get_decade_iconic_artists


class _DynamicDecadeLandmarks(dict):
    """Dictionary-like proxy for decade landmark masterpieces."""

    def __getitem__(self, key):
        return get_decade_landmarks().get(key, [])

    def get(self, key, default=None):
        return get_decade_landmarks().get(key, default)

    def __contains__(self, key):
        return key in get_decade_landmarks()

    def items(self):
        return get_decade_landmarks().items()

    def keys(self):
        return get_decade_landmarks().keys()

    def values(self):
        return get_decade_landmarks().values()


class _DynamicDecadeArtists(dict):
    """Dictionary-like proxy for decade iconic artists."""

    def __getitem__(self, key):
        return get_decade_iconic_artists().get(key, [])

    def get(self, key, default=None):
        return get_decade_iconic_artists().get(key, default)

    def __contains__(self, key):
        return key in get_decade_iconic_artists()

    def items(self):
        return get_decade_iconic_artists().items()

    def keys(self):
        return get_decade_iconic_artists().keys()

    def values(self):
        return get_decade_iconic_artists().values()


DECADE_LANDMARKS = _DynamicDecadeLandmarks()
DECADE_ICONIC_ARTISTS = _DynamicDecadeArtists()
