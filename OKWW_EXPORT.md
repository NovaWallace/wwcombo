# OKWW team export

The desktop combo library can turn the selected wwcombo chart into an OKWW
three-character import ZIP. The default combo-flow view lays out the inferred
character runs as familiar action chips. Its toolbar can add, change, move,
copy, cut, paste, and delete actions. The timeline view remains available for
timing-sensitive corrections. Both edit one separate local OKWW draft, not the
source chart. The code tab shows the generated Python before export.

The ZIP contains exactly `team.json` and three `{Class}.py` files. Import it in
OKWW's custom team UI. The generated classes inherit OKWW's built-in character
classes, so existing detector methods remain available, but the generated
`do_perform()` replaces each built-in rotation for that team.

## Translation semantics

- The input events come from wwcombo's existing simulated-input builder. It
  uses `startMin` and `durationMax`, merges overlapping click windows, repeats
  taps at the configured key frequency, and cuts held inputs at switches.
  Start/stop controls and free-input steps are omitted. The exported team uses
  recorded switch press lengths by default, not the simulation DLC's 2-second
  minimum. A separate minimum-switch-hold setting can be raised if the game
  misses a short recorded switch.
- Each generated character carries the same team event stream. A shared task
  clock (`time.perf_counter`) waits for absolute down/up deadlines; no
  high-level skill helper is allowed to block the default event sequence.
  The startup plus recorded loops run once, then the loop section repeats.
  Every roughly five seconds the replay yields to OKWW's combat loop while
  retaining its absolute clock and cursor. All held keys are released in
  `finally` on completion or failure.
- An intro-marked switch (`ib`, `iib`, etc.) is only a non-blocking marker by
  default. Explicitly enabling its condition turns it into a visual check.
  Manual checks may pause the replay; all later deadlines then move by the
  actual time spent waiting. A failed check can skip its input window, go to
  the next switch, retry a post-check action, jump to a later fallback node,
  or abort, depending on the selected policy. A branch target must be a later
  chart node: the generator releases held inputs, discards the abandoned
  route, and resumes from that node without replaying overdue events.
- The branch option is the generic equivalent of role-script patterns such as
  `if execute_prompt: execute else: dodge`, `if liberation_fired: transform
  else: charge_again`, and `if switch_out_failed: retry_or_leave`. It does not
  invent character-specific visual probes; choose an available OKWW probe for
  the decision point and bind its failure route in the editor.
- The probe catalog now includes the reusable character-specific detectors
  present in the OKWW role sources: Aemeath, Augusta, Camellya, Cartethyia,
  Denia, Hsin, Hiyuki, Luhesi, Lupa, Qingxiao, Suisui, Phoebe, Linnai,
  Xigelika, Zani, and Iuno. This covers their special skill/forte prompts,
  form-stage icons, sword/gauge states, air-action prompts, break prompts,
  and the stable color-based states exposed by their helpers. Internal
  timers, cached counters, teammate bookkeeping, and composite routines such
  as Suisui's `dps_touch()` are intentionally not presented as visual probes.
- Key names resolve through OKWW's configured E/Q/R/dodge/jump/tool bindings.
  Basic/heavy attacks use the mouse; character switches use 1/2/3. Before
  sending the next action, visual switch verification refreshes OKWW's
  active-character flags. A team-wide failure option either aborts (default)
  or sends 1-3 bounded retry pulses. The verification timeout defaults to
  1.5 seconds to allow for entrance animations and is adjustable per team.
  Each retry awaits visual confirmation;
  the actual wait shifts later deadlines. Exhaustion aborts the current
  combat run rather than blindly continuing on the wrong character.
- If capture, OS scheduling, or an animation makes an input more than 20 ms
  late, the replay clock shifts forward rather than bursting overdue inputs.
  Relative spacing is retained after the delay; missed wall-clock time cannot
  be recovered.
- Before the first input, the generated code checks the three roster slots and
  the initial active character (when the chart does not begin with a switch).
  It aborts on a mismatch instead of playing a valid key stream on the wrong
  team order.
- Imported team classes are replaced when OKWW reloads its roster, not in the
  middle of an already running combat task. The v5 package logs
  `wwcombo replay timed-v5-branches` at combat start; stop the current OKWW
  auto-combat and reload the team after importing to confirm the new code runs.
- `liberation_cast` now means that the liberation icon appears on cooldown;
  it is only a visual inference, not proof of damage or an enhanced form.
  Character-specific probes are available for known indicators.

The time origin is the first generated `do_perform()` invocation, with an
optional start delay. This is a best-effort Windows input scheduler, not a
hard real-time system: game animation locks, capture cost, and OS scheduling
can still make an input late or cause it to be ignored. Those cases require
game-side calibration and cannot be fixed by changing the ZIP structure.

The exported code is never executed by wwcombo. ZIP structure, generated
Python syntax, and a virtual-clock event replay are tested locally;
combat behavior still requires game-side verification. Automated gameplay may
carry an account risk under the game's terms of service.

The character-name catalog was adapted from
[okww-axis-converter](https://github.com/woachy/okww-axis-converter), licensed
under MIT. Its license notice is preserved in
[`OKWW_AXIS_CONVERTER_LICENSE.txt`](OKWW_AXIS_CONVERTER_LICENSE.txt).
