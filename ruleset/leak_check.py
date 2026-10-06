import zipfile

# Real leak needles: grant material and local directory paths only.
# (`ctecx_instruct@1` format names and shell `\` continuations are not leaks.)
for label, path in [
    ("concrete", "ruleset/DGUI_HMEM_RULESET_INSTRUCT.zip"),
    ("template", "ruleset/templates/DGUI_HMEM_RULESET_INSTRUCT.zip"),
]:
    z = zipfile.ZipFile(path)
    names = z.namelist()
    blob = b"".join(z.read(n) for n in names)
    needles = [b".token", b"deckergui_sdk_jev_hypermem", b"apikey_", b"D:"]
    leaks = {n.decode(): blob.count(n) for n in needles if n in blob}
    print(f"{label}: members={len(names)} leak-hits={leaks or 'NONE'}")
    if label == "template":
        assert not leaks, f"placeholder leak in template zip: {leaks}"
print("template: placeholders clean")