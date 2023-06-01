const ascii = `
(%%%START | font: rev

======================================
=============  =======================
==   ===  ==    ===   ===  =  ==    ==
=  =  =======  ===  =  ==  =  ==  =  =
==    ==  ===  ===     ===   ===  =  =
====  ==  ===  ===  ======   ===    ==
=  =  ==  ===  ===  =  ==  =  ==  ====
==   ===  ===   ===   ===  =  ==  ====
======================================

(%%%DIV | font: speed

        __________
_______ ___(_)_  /_________  _________
__  __ \`/_  /_  __/  _ \\_  |/_/__  __ \\
_  /_/ /_  / / /_ /  __/_>  < __  /_/ /
_\\__, / /_/  \\__/ \\___//_/|_| _  .___/
/____/                        /_/

(%%%DIV | font: poison

 @@@@@@@@  @@@  @@@@@@@  @@@@@@@@  @@@  @@@  @@@@@@@
@@@@@@@@@  @@@  @@@@@@@  @@@@@@@@  @@@  @@@  @@@@@@@@
!@@        @@!    @@!    @@!       @@!  !@@  @@!  @@@
!@!        !@!    !@!    !@!       !@!  @!!  !@!  @!@
!@! @!@!@  !!@    @!!    @!!!:!     !@@!@!   @!@@!@!
!!! !!@!!  !!!    !!!    !!!!!:      @!!!    !!@!!!
:!!   !!:  !!:    !!:    !!:        !: :!!   !!:
:!:   !::  :!:    :!:    :!:       :!:  !:!  :!:
 ::: ::::   ::     ::     :: ::::   ::  :::   ::
 :: :: :   :       :     : :: ::    :   ::    :

(%%%DIV | font: nancyj-fancy

         oo   dP
              88
.d8888b. dP d8888P .d8888b. dP.  .dP 88d888b.
88'  \`88 88   88   88ooood8  \`8bd8'  88'  \`88
88.  .88 88   88   88.  ...  .d88b.  88.  .88
\`8888P88 dP   dP   \`88888P' dP'  \`dP 88Y888P'
     .88                             88
 d8888P                              dP

(%%%DIV | font: lean

              _/    _/
     _/_/_/      _/_/_/_/    _/_/    _/    _/  _/_/_/
  _/    _/  _/    _/      _/_/_/_/    _/_/    _/    _/
 _/    _/  _/    _/      _/        _/    _/  _/    _/
  _/_/_/  _/      _/_/    _/_/_/  _/    _/  _/_/_/
     _/                                    _/
_/_/                                      _/

(%%%DIV | font: larry3d

          __
       __/\\ \\__
   __ /\\_\\ \\ ,_\\    __   __  _  _____
 /'_ \`\\/\\ \\ \\ \\/  /'__\`\\/\\ \\/'\\/\\ '__\`\
/\\ \\L\\ \\ \\ \\ \\ \\_/\\  __/\\/>  </\\ \\ \\L\\ \
\\ \\____ \\ \\_\\ \\__\\ \\____\\/\\_/\\_\\ \\ ,__/
 \\/___L\\ \\/_/\\/__/\\/____/\\//\\/_/ \\ \\ \\/
   /\\____/                        \\ \\_\
   \\_/__/                          \\/_/

(%%%DIV | font: fender

              ||
        ''    ||
.|''|,  ||  ''||''  .|''|, \\  // '||''|,
||  ||  ||    ||    ||..||   ><    ||  ||
\`|..|| .||.   \`|..' \`|...  //  \\  ||..|'
    ||                             ||
 \`..|'                            .||

(%%%DIV | font: graffiti

        .__  __
   ____ |__|/  |_  ____ ___  _________
  / ___\\|  \\   __\\/ __ \\\\  \\/  /\\____ \\
 / /_/  >  ||  | \\  ___/ >    < |  |_> >
 \\___  /|__||__|  \\___  >__/\\_ \\|   __/
/_____/               \\/      \\/|__|

(%%%DIV | font: merlin1

  _______   __  ___________  _______  ___  ___    _______
 /" _   "| |" \\("     _   ")/"     "||"  \\/"  |  |   __ "\\
(: ( \\___) ||  |)__/  \\\\__/(: ______) \\   \\  /   (. |__) :)
 \\/ \\      |:  |   \\\\_ /    \\/    |    \\\\  \\/    |:  ____/
 //  \\ ___ |.  |   |.  |    // ___)_   /\\.  \\    (|  /
(:   _(  _|/\\  |\\  \\:  |   (:      "| /  \\   \\  /|__/ \\
 \\_______)(__\\_|_)  \\__|    \\_______)|___/\\___|(_______)

(%%%DIV | font: bloody

  ▄████  ██▓▄▄▄█████▓▓█████ ▒██   ██▒ ██▓███
 ██▒ ▀█▒▓██▒▓  ██▒ ▓▒▓█   ▀ ▒▒ █ █ ▒░▓██░  ██▒
▒██░▄▄▄░▒██▒▒ ▓██░ ▒░▒███   ░░  █   ░▓██░ ██▓▒
░▓█  ██▓░██░░ ▓██▓ ░ ▒▓█  ▄  ░ █ █ ▒ ▒██▄█▓▒ ▒
░▒▓███▀▒░██░  ▒██▒ ░ ░▒████▒▒██▒ ▒██▒▒██▒ ░  ░
 ░▒   ▒ ░▓    ▒ ░░   ░░ ▒░ ░▒▒ ░ ░▓ ░▒▓▒░ ░  ░
  ░   ░  ▒ ░    ░     ░ ░  ░░░   ░▒ ░░▒ ░
░ ░   ░  ▒ ░  ░         ░    ░    ░  ░░
      ░  ░              ░  ░ ░    ░

(%%%END <https://patorjk.com/software/taag/>
`

export const getFiglets = (a: string): string[] => {
  const fig: string[] = []

  const t = (n: string): string => '(%%%' + n.toUpperCase()
  const tag = Object.fromEntries(['start', 'end', 'div'].map((i) => [i, t(i)]))

  try {
    let foundStart = false
    const lines = a.split('\n')

    for (const line of lines) {
      const l = line.trim()
      if (l === '') {
        continue
      }

      if (l.startsWith(tag.start)) {
        foundStart = true
        continue
      }

      if (l.startsWith(tag.end)) {
        break
      }

      if (foundStart) {
        if (l.startsWith(tag.div)) {
          fig.push(tag.div)
          continue
        }

        fig.push(' '.repeat(2).concat(line))
      }
    }

    return fig.join('\n').split(tag.div)
  } catch (e) {
    return []
  }
}

export default getFiglets(ascii)