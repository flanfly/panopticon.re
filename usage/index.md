---
title: Usage
layout: documentation
---
# User Documentation

Panopticon is a cross platform disassembler for reverse engineering. It
disassembles AMD64, AVR and MOS-6502 binaries, groups code into functions and
displays their bodies as control flow graphs. Panopticon allows reverse
engineers to annotate functions and assembly listings with comments.

The current version supports 32 and 64 bit ELF files as well as raw memory
dumps (AVR & MOS).

## Launch

After successful [installation](https://panopticon.re/get) launching Panopticon
will start the Welcome Screen.

![Welcome screen]({{ site.url }}/img/welcome.png){:class="img-thumbnail"}

It displays previous sessions on the right, with the least recently opened
first. Clicking one of them resumes the session, clicking the little trash can
right to the sessions name deletes it.

The options on the left will ask the user to select a file and start
a new session (top), start an empty session (middle) or open an executable
shipped with Panopticon.

## New Session
Clicking the top option presents the user with a file picker window.

![File Picker]({{ site.url }}/img/file-picker.png){:class="img-thumbnail"}

The upper input field is the path to the directory that's visible in the central
list. Typing a different path into it and pressing <kbd><kbd>Enter</kbd></kbd>
will navigate to the respective directory. Pressing the <code>Up</code> button
will move the picker to the parent directory, if there is one. Clicking the
directories in the central list navigates into them. Clicking on files will
display a summary of the files contents below in case Panopticon recognizes the
file type. The entry field below the central list displays the selected file,
if any. Typing a file name into this entry is the same as selecting it in the
list.

Double clicking a file or selecting a file with a single click and clicking the
<code>Open</code> button will load the file from disk and start a new session.

If the file is recognized as an executable and its instruction set is supported,
Panopticon will start the disassembly process in background.

## Workspace
The workspace view displayed after selecting a file to work on lists all
functions found in the executable. Clicking these selects them in the view.
The workspace can be toggled between showing all functions in a graph and

![Control Flow Graph]({{ site.url }}/img/cfg-screen.png){:class="img-thumbnail"}

In the latter, clinking on a single assembly code line will make a text cursor
appear right to it. Typing will add the text as comment to the assembly line.
The comment is saved by pressing <kbd><kbd>Enter</kbd></kbd>. To make multi-line
comment use <kbd><kbd>Shift</kbd>+<kbd>Enter</kbd></kbd>.

Grabbing and holding the left mouse button while the cursor is not over a basic
block moves the view.

## Saving
When closing Panopticon or opening a new session via the <code>Project</code>
menu all changes made to the current session are saved without asking. The user
does not need to save anything explicitly. The <code>Save</code> option in the
<code>Project</code> menu allows to set the file name and path to save to.
