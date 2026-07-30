# Test fixtures

`mock_badger.py` is a deterministic stand-in for the external AI Badger CLI.
It supports isolated development and tests without an installed `badger`
binary, an AI Badger source checkout, network access, or private files.

The mock has a fixed synthetic topology and emits placeholder source content.
It is test/development support only and is not extension runtime code.
