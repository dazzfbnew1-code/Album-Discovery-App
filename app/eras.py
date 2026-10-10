"""Curated discovery seeds and landmark definitions for historical musical decades."""
from .overrides import get_decade_landmarks, get_decade_iconic_artists


class _DynamicDecadeProxy(dict):
    """Dictionary-like proxy that always retrieves current decade data dynamically."""

    def __init__(self, getter_func):
        super().__init__()
        self._getter = getter_func

    def __getitem__(self, key):
        return self._getter().get(key, [])

    def get(self, key, default=None):
        return self._getter().get(key, default)

    def __contains__(self, key):
        return key in self._getter()

    def items(self):
        return self._getter().items()

    def keys(self):
        return self._getter().keys()

    def values(self):
        return self._getter().values()


DECADE_LANDMARKS = _DynamicDecadeProxy(get_decade_landmarks)
DECADE_ICONIC_ARTISTS = _DynamicDecadeProxy(get_decade_iconic_artists)
