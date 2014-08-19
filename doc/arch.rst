---
layout: default
title: Architecture
---

Architecture
============

Panopticon is a free/libre disassembler and binary analysis tool. It started as
platform for experiments in static program analysis and grew into a complete
library (libpanopticon) and a Qt 5 based UI. The library is written in C++, the
UI is a mix of C++ and QML. Both are licensed as GPLv3.

Library Overview
----------------

The libpanopticon implements structures to model in-memory representation of a
program including is control flow, call graph, structured data and memory maps.
The most important types and their interaction are as follows:

.. dot:: assets/arch-interact.png ../assets/arch-interact.png

   digraph G {
      graph [bgcolor="transparent"]
      session -> database;
      database -> program;
      program -> procedure;
      procedure -> basic_block;
      basic_block -> mnemonic;
      mnemonic -> instr;
      database -> region;
      region -> layer;
      database -> structure;
      structure -> field;
   }

The program, procedure, basic_block and instr types model the behaviour of code,
structure and field the meaning of data. The region and layer types represent
how the program is laid out in memory.

Aside from these there are the storage, blob an loc<T> types that manage
serialization of Panopticon types into an on-disk format.

Code
~~~~

Panopticon models code as a collection of programs contained in a file. Each
program consists of procedures (e.g. functions). A procedure is a control flow
graph, e.g. a graph with nodes representing a sequence of instructions and
directed edges for (un)conditional jumps. These instruction sequences are basic
blocks and contain a list of mnemonics. Panopticon models the semantic of each
mnemonic using its own language PIL. Each mnemonic instance has a sequence of
PIL instructions (instr type) implementing it.

Panopticon allows multiple programs per session. An example for that would be a
C# application that calls functions of a DLL written in C. Such an application
would have two program instances. One for the CIL code of the C# program and one
for the amd64 of ia32 object code of the DLL.

One of the key features of Panopticon is the ability to "understand" the binary.
The disassembler not only knowns about the shape of mnemonics (its syntax) but
also what is does (the semantics). Each mnemonics includes a short program in PIL
the implements the mnemonic. This allows sophisticated analysis like symbolic
execution, automatic crafting of input to reach certain basic blocks,
decompilation and computing bounds on register values without executing the code.

Instances of the program, procedure, basic_block and instr types are created by
the disassembler subsystem (disassembler and code_generator types). A
disassembler is given a range of data and an instruction set architecture and
creates a model of the code found in the data.

.. Overview data: field and structure

Sources
~~~~~~~

The in-memory layout of an executable is modeled using the region, layer and
tryte types. All data is organized into regions. Each region is an array of
cells numbered from 0 to n. Each cell is an tryte instance that is either
undefined or has a value between 0 and 255 (both including). Regions are read
only. Changing their contents is done by applying layer instance to them. A layer
reads part of a region or another layer and returns a new tryte array. Layers
can for example decrypt parts of a region or replace individual trytes with new
ones.

In normal operation there is one region for each memory address space, one on
Von-Neumann machines two on Harvard architectures. Other uses for regions are
applying functions to tryte array where the result is not equal in size to the
input (for example uncompressing parts of the executable image).

Marshalling
~~~~~~~~~~~

The final group of types are storage, blob, loc<T> and the rdf namespace. These
allow fairly transparent (un)marshalling of all important Panopticon types onto
disk. The loc<T> template implements a smart pointer that lazily loads its
instance from disk and keeps track of changes on the enclosed instance. A list
of all loc<T> instances that are out of sync with the version on disk is kept.
The changes are flushed by calling save_point().

The instance on disk are referenced using a randomly generated UUID. The on disk
is an RDF graph. The graph is saved as a edge list in a embedded database. For
large binary objects like files the blob type is used instead of loc<T>. The
contents of blob instances are written as files instead of putting the into the
database. The database and the blob files are archived using cpio and compressed
using LZMA.

Each type that uses the loc<T> smart pointer implements the marshal and
unmarshal functions that turn an instance into a edge list and a set of blob
instances or allocate a new instance from and edge list and blob set.

Graphical UI
------------

The qtpanopticon application uses the functionality implemented in the
libpanopticon to allow browsing the disassembled code, annotated data with
structure definitions ("templates") and modify section and file contents.

The UI widgets are mostly implemented in QML ("res/"), with glue classes written
in C++ to connect the QML code to libpanopticon. The UI includes a implementation
of DOT ("include/dot/" and "src/sugiyama.cc") for layouting control flow graphs.

Moving data to QML is done by implementing Models (QAbstractModel subclasses
LinearModel and ProcedureModel) that return JSON encoded Javascript objects.
This makes memory management easier and save us from implementing dozens of
QObject subclasses.
