# Demo Web migration boundary

The working CabinSentinel demo remains in `../../frontend` while its modified
files are stabilized. This workspace entry exposes it as `@cabinsentinel/demo-web`
without copying, deleting, or overwriting that work.

The demo is intentionally separate from product accounts and must continue to
label simulated sensor data, simulated actions, and the unvalidated stock model.
Source relocation into this directory is a later mechanical change after the
baseline branch is clean and CI remains green.
