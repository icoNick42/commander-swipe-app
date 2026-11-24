"""Start the sim job board (see forgesim/board.py). One copy per PC.

Started at logon by the shortcut the installer puts in the Startup folder.
Runs with pythonw (no window). Logs to board.log next to this file.
"""

import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.chdir(HERE)

LOCK = os.path.join(HERE, "board.lock")


def single_instance():
    """Hold a lock on board.lock for as long as this process lives."""
    fh = open(LOCK, "a+")
    try:
        if os.name == "nt":
            import msvcrt

            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return None
    return fh


if __name__ == "__main__":
    lock = single_instance()
    if lock is None:
        sys.exit(0)  # already running
    from forgesim import board

    while True:
        try:
            board.loop()
        except KeyboardInterrupt:
            break
        except Exception as e:  # never stay down: log it and start again
            board.log("board crashed, restarting in 60s: %r" % (e,))
            time.sleep(60)
