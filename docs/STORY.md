# ESCAPE: story bible (draft for Renzo to edit)

Every lesson, note, room intro and hint must fit this document. If a line of text does not move the story or teach the skill, cut it.

## Premise
In a basement lab, a forgotten mainframe called **ATLAS** is about to be switched off for good. Someone opened Vim on it years ago and walked away. That editor session never closed, and inside it something woke up: **you, a stray cursor**.

When ATLAS powers down, everything still running inside it is erased. Your only way out is the **Exit Port**, the one place where a clean `:wq` writes you out to the network before the lights go dark.

The title is the joke everyone knows ("how do I exit Vim?") turned into the whole quest.

## Characters
| Character | Role | Voice |
|---|---|---|
| **You (the cursor)** | Player. Silent. Learns Vim to survive. | n/a |
| **The Operator** | The sysadmin who ran ATLAS and vanished. Left notes on terminals (`N`) all over the machine. Each note teaches one command. | Dry, kind, a bit tired. Writes like someone leaving instructions for a colleague. "If you are reading this, you are stuck. Good news: so was I." |
| **GC (the Garbage Collector)** | The cleanup daemon. Sweeps idle memory and deletes anything that isn't moving. Causes the corrupted sectors. Not evil, just doing its job, which is the problem. | Short system messages in caps. `IDLE PROCESS DETECTED. SCHEDULING DELETION.` |
| **ECHO** | A half-deleted process you meet in Region 1. Repeats your last command back to you (later, the hook for teaching `.`). Comic relief, then an ally. | Repeats fragments. "...the end of the line... the end..." |

## Stakes and pacing
- **The power meter** (story only, not a real timer) drops a step each region: "ATLAS POWER 82%". It creates urgency without time pressure on the player.
- **GC sweeps** are the antagonist beats: at the end of each region GC corrupts part of what you cleared, which brings in review (corrupted sectors).
- **The Operator's notes** reveal, bit by bit, why they left and that they planned the escape route for whoever came after.

## Region arcs

| Region | Machine part | Skills | Story beat |
|---|---|---|---|
| Prologue: **Boot Sector** | The editor session you were born in | `:q`, `:q!`, `i`/`<Esc>`, `:wq` | You try to leave and fail (`:q` only closes the session you're standing in). The first note: "Quitting doesn't get you out. Saving does. Find the Exit Port." You learn to write a file: your own name in the process table, so GC can't delete you as "unnamed". |
| 1: **Memory Fields** | Flat open RAM | `hjkl`, `w b e`, `W B E`, `0 ^ $`, `gg G`, counts | Wide open space, the first real exploration. You meet ECHO, stuck at "the end of the line" (the `$` lesson). GC's first sweep corrupts the Boot Sector behind you. |
| 2: **Edit Forge** | Where files are written | `x r i a o`, `d c y p`, `u`, `.` | Corrupted files block the corridors; you repair them by editing. ECHO turns out to *be* `.` (repeat). |
| 3: **Jump Canyon** | Fragmented disk | `f t ; ,`, `%`, `{ }`, `H M L` | Long gaps you can only cross by jumping to the right character. |
| 4: **Text-Object Temple** | The compiler's sanctum | `iw aw i" a( ip` | Ancient structured code; you act on whole objects, not characters. |
| 5: **Search Archive** | The Operator's archive | `/ ? n N * #`, marks, registers, visual mode | The full story comes out. You carry the escape key in a register (`"ky`) to the Exit Port: `:wq`. |

## Tone rules
1. The Operator teaches with **why**, not just what: "You could press `l` forty times. Or you could press `$` once and go get a coffee."
2. Humour comes from the situation (a cursor in a dying machine), never from random jokes.
3. Never insult the player for failing. GC is the threat, not the game.
4. Each note is max 3 short sentences plus the example.

## The twist (decided 2026-11-10)
**ECHO is the Operator.**

The Operator never left the building. On the last night, with ATLAS scheduled for shutdown, they tried what you are trying: they went *in*, as a cursor, to reach the Exit Port. They wrote the notes as they went, for whoever came next. They didn't make it: GC caught them idle near the end of the line and deleted most of them. What survived is ECHO, a fragment that can only repeat.

**How it is revealed (seeded, never stated early):**
- ECHO repeats lines that match the notes word for word. Attentive players notice.
- Region 2: ECHO "is" `.` (repeat). The Operator's notes start to sound like ECHO.
- Region 5, the Search Archive: searching the Operator's logs (`/`, `n`) uncovers the last log entry, written from inside ATLAS. The reveal.

**The final choice at the Exit Port:** `:wq` writes one process out to the network. The game has taught registers just before. A player who yanks ECHO into a register (`"ey`) and carries it to the port writes *both* of you out: the true ending. A player who just writes `:wq` escapes alone: the plain ending, with the last note: "You made it. That's what matters. Close the door behind you."

The story's emotional peak is a Vim command the player has just learned: the twist is playable, not just told.

## Decisions (Renzo, 2026-11-10)
- **Names:** ATLAS, the Operator, GC and ECHO stay.
- **Ending:** twist ending, as above.
- **Prologue:** skippable. A player can choose "I know how to quit Vim" on the title screen and pass one short test (insert text, then save and quit) to start in Region 1 with the Prologue skills marked learned.
