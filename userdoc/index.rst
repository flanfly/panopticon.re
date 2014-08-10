---
title: User Documentation
layout: default
---

Users Documenation
==================

Panopticon is a cross platform disassembler for reverse engineering.
It consists of a C++ library for disassembling, analysing decompiling
and patching binaries for various platforms and instruction sets.

Panopticon comes with GUI for browsing control flow graphs, displaying
analysis results, controlling debugger instances and editing the on-disk
as well as in-memory representation of the program.

Building From Source
====================

In order to compile Panopticon the following needs to be installed first:

- Qt 5.3
- CMake 2.8
- g++ 4.7, Clang 3.4 or VC 2013
- Boost 1.53
- Kyoto Cabinet 1.2.76
- libarchive 3.1.2

Linux
-----

First install the prerequisites using your package manager.

Ubuntu 13.10 and 14.04:

.. code-block:: bash

	sudo apt-get install g++ cmake git libboost-dev libboost-filesystem-dev \
	                     libboost-graph-dev libkyotocabinet-dev libarchive-dev \
	                     qt5-default qtdeclarative5-dev

Fedora 20:

.. code-block:: bash

	sudo yum install gcc-c++ cmake git kyotocabinet-devel libarchive-devel \
	                 qt5-qtdeclarative-devel qt5-qtquickcontrols boost-filesystem \
	                 boost-graph boost-static

After that clone the repository onto disk, create a build directory and
call cmake and the path to the source as argument. Compile the project
using GNU Make.

.. code-block:: bash

	git clone https://github.com/das-labor/panopticon.git
	mkdir panop-build
	cd panop-build
	cmake ../panopticon
	make -j4
	sudo make install

Windows
-------

On Windows Panopticon can be built using either Microsoft Visual
Studio 2013 Update 2 (64 bit) or Mingw 4.8.2 (32 bit). You need
at least Windows 7.

Visual Studio 2013
~~~~~~~~~~~~~~~~~~

Download and install `CMake <http://www.cmake.org/cmake/resources/software.html>`_.

Download and install Qt 5.3 using the `Qt Online Installer
<http://qt-project.org/downloads>`_. Install the msvc2013_64 flavor.

Download `Boost 1.56.0 beta <http://sourceforge.net/projects/boost/files/boost/1.56.0.beta.1/>`_ and unpack the archive. Open the Visual Studio Command Prompt for 64 bit, navigate into the unpacked archive and build the library.

.. code-block:: bat

	bootstrap.bat
	.\b2 --prefix=<Qt Dir>\msvc2013_64
	.\b2 --prefix=<Qt Dir>\msvc2013_64 install

Note that <Qt Dir> is the folder where you installed the Qt 5.3 SDK.

Download the the pre-built binaries of of the other `Panopticon dependencies for MSVC 2013 <http://ftp.panopticon.re/pub/panopticon-deps-msvc2013.zip>`_. Copy the the contents of the include and lib folders <Qt Dir>\\msvc2013_64\\include and <Qt Dir>\\msvc2013_64\\lib respectivly.

Clone the `Panopticon repository <git://github.com/das-labor/panopticon.git>`_. Open cmake-gui, select the cloned repository as source code folder and new empty folder as build folder. Use the Add Entry button to add an Path entry called CMAKE_PREFIX_PATH that points to <Qt Dir>\\msvc2013_64.

.. image:: /userdoc/cmake.png

Click "Generate", select "Visual Studio 12 2013 Win64" and click "Finish". After build configuration was successful open the panopticon.sln file inside the build folder with Visual Studio and build the solution (F7).

Mingw
~~~~~

Download and install `CMake <http://www.cmake.org/cmake/resources/software.html>`_.

Download and install Qt 5.3 using the `Qt Online Installer
<http://qt-project.org/downloads>`_. Install the mingw482_32 flavor.

Download `Boost 1.56.0 beta <http://sourceforge.net/projects/boost/files/boost/1.56.0.beta.1/>`_ and unpack the archive. Open the Command Prompt, navigate into the unpacked archive and build the library.

.. code-block:: bat

	./bootstrap.sh mingw
	./b2 toolset=gcc --prefix=<Qt Dir>\mingw482_32
	./b2 toolset=gcc --prefix=<Qt Dir>\mingw482_32 install

Note that <Qt Dir> is the folder where you installed the Qt 5.3 SDK.

Download the the pre-built binaries of of the other `Panopticon dependencies Mingw <http://ftp.panopticon.re/pub/panopticon-deps-mingw.zip>`_. Copy the the contents of the include and lib folders <Qt Dir>\\mingw482_32\\include and <Qt Dir>\\mingw482_32\\lib respectivly.

Clone the `Panopticon repository <git://github.com/das-labor/panopticon.git>`_. Open cmake-gui, select the cloned repository as source code folder and new empty folder as build folder. Use the Add Entry button to add an Path entry called CMAKE_PREFIX_PATH that points to <Qt Dir>\\msvc2013_64.

.. image:: /userdoc/cmake.png

Click "Generate", select "Mingw Makefiles" and click "Finish". After build configuration was successful navigate to the build folder in the Command Prompt and type make.

Running
=======

The current version only supports AVR and has no ELF or PE loader yet.
To test Panopticon you need relocated AVR code. Such a file is prepared in
``lib/test/sosse``.

```bash
qt/qtpanopticon -a ../panopticon/lib/test/sosse
```

Or, you can start Panopticon without command line parameters and
select the test file manually by starting a new session.

Contributing
============

Panopticon is licensed under GPLv3 and is Free Software. Hackers are
always welcome. See http://panopticon.re for our wiki and issue tracker.

Panopticon consists of two sub projects: libpanopticon and qtpanopticon.
The libpanopticon resides in the lib/ directory inside the repository. It
implements all disassembling and analysis functionality.
The libpanopticon has a test suite that can be found in lib/test/ after
compilation. The library is documented using Doxygen. To generate an API
documentation in HTML install Doxygen and call ``doxygen doc/doxyfile``
from inside the repository. The documentation is written to ``doc/html/``.

The qtpanopticon application is a Qt5 GUI for libpanopticon. The front
end uses QtQuick2 that interacts with libpanopticon using a thin C++
interface (the Session, Panopticon, LinearModel and ProcedureModel classes).
For the graph view qtpanopticon implements the graph layout algorithm used
by Graphviz' DOT program[1]. The Sugiyama class exposes this functionality
to QtQuick2. The QML files that reside in res/.

References
==========

[1] K. Sugiyama, S. Tagawa, and M. Toda.
    “Methods for Visual Understanding of Hierarchical Systems”.
    IEEE Transactions on Systems, Man, and Cybernetics, 1981.

2014-8-2
