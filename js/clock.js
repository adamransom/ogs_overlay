// --------------------------
// Mostly taken from OGS code
// --------------------------
let clock_timer = null;
let now;
let paused_since = null;

let black_pause_text = null;
let white_pause_text = null;

exports.setOGSClock = function(clock, phase, time_control, pause_control, sockets) {
  if ("pause" in clock) {
    if (clock.pause.paused) {
      paused_since = clock.pause.paused_since;
      pause_control = clock.pause.pause_control;

      /* correct for when we used to store paused_since in terms of seconds instead of ms */
      if (paused_since < 2000000000) {
        paused_since *= 1000;
      }
    } else {
      paused_since = null;
      pause_control = null;
    }
  }

  const black_clock_el = document.getElementById('black_time');
  const white_clock_el = document.getElementById('white_time');

  let now;
  let use_short_format = false;

  let formatTime = function(player, time, base_time, player_id) {
    let next_clock_update = 60000;
    let ms;
    let time_suffix = "";
    let periods_left = 0;
    let main_time_div = document.getElementById(player + "_main_time");
    let periods_div = document.getElementById(player + "_periods");
    let period_time_div = document.getElementById(player + "_period_time");
    let overtime_div = null;
    let overtime_parent_div = null;


    if (typeof(time) === "object") {
      ms = (base_time + (time.thinking_time) * 1000) - now;
      if ("moves_left" in time) { /* canadian */
        if ("block_time" in time) {
          if (time.moves_left) {
            time_suffix = "<span class='time_suffix'> + " + shortDurationString(time.block_time) + "/" + time.moves_left + "</span>";
          }
        }
        if (time.thinking_time > 0) {
          periods_left = 1;
        }
        if (ms < 0 || (time.thinking_time === 0 && "block_time" in time)) {
          if (overtime_parent_div) {
            overtime_parent_div.classList.add("in-overtime");
          }
          ms = (base_time + (time.thinking_time + time.block_time) * 1000) - now;
          if (time.moves_left) {
            time_suffix = "<span class='time_suffix'>/ " + time.moves_left + "</span>";
          }
        }

        let moves_done = time_control.stones_per_period - time.moves_left;

        if (periods_div) {
          periods_div.innerHTML = moves_done + " / " + time_control.stones_per_period;
        }

        if (period_time_div) {
          period_time_div.innerHTML = shortDurationString(time_control.period_time);
        }
      }
      if ("periods" in time) { /* byo yomi */
        let period_offset = 0;
        if (ms < 0 || time.thinking_time === 0) {
          if (overtime_parent_div) {
            overtime_parent_div.classList.add("in-overtime");
          }

          period_offset = Math.floor((-ms / 1000) / time.period_time);
          if (period_offset < 0) {
            period_offset = 0;
          }

          while (ms < 0) {
            ms += time.period_time * 1000;
          }

          if (player_id !== clock.current_player) {
            ms = time.period_time * 1000;
          }
          periods_left = ((time.periods - period_offset));
          if (((time.periods - period_offset) - 1) > 0) {
            if (period_time_div) {
              period_time_div.innerHTML = "× " + shortDurationString(time.period_time);
            }
            time_suffix = "<span class='time_suffix'> + " + periods_left + " × " + (shortDurationString(time.period_time)).trim() + "</span>";
          }
          if (((time.periods - period_offset) - 1) < 0) {
            ms = 0;
          }
        } else {
          periods_left = time.periods;
          time_suffix = "<span class='time_suffix'> + " + (time.periods) + " × " + (shortDurationString(time.period_time)).trim() + "</span>";
          if (period_time_div) {
            period_time_div.innerHTML = "× " + shortDurationString(time.period_time);
          }
        }

        if (periods_div) {
          periods_div.innerHTML = "+ " + periods_left;
        }
      }
    } else {
      /* time is just a raw number */
      ms = time - now;
    }

    let seconds = Math.ceil((ms - 1) / 1000);
    let days = Math.floor(seconds / 86400); seconds -= days * 86400;
    let hours = Math.floor(seconds / 3600); seconds -= hours * 3600;
    let minutes = Math.floor(seconds / 60); seconds -= minutes * 60;

    let html = "";
    let cls = "plenty_of_time";
    if (ms <= 0 || isNaN(ms)) {
      next_clock_update = 0;
      cls = "out_of_time";
      html = "0.0";
    } else if (days > 1) {
      html = plurality(days, _("Day"), _("Days")) + " " + (hours ? plurality(hours, _("Hour"), _("Hours")) : "");
      next_clock_update = 60000;
    } else if (hours || days === 1) {
      next_clock_update = 60000;
      if (days === 1) {
        hours += 24;
      }
      html = days === 0 ? `Game clock: ${hours}:${minutes}` : `Game clock: ${hours}`;
    } else {
      next_clock_update = ms % 1000; /* once per second, right after the clock rolls over */
      if (next_clock_update === 0) {
        next_clock_update = 1000;
      }
      if (paused_since) {
        next_clock_update = 60000;
      }
      html = minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
      if (minutes === 0 && seconds <= 10) {
        if (seconds % 2 === 0) {
          cls += " low_time";
        }
      }
    }

    if (clock.start_mode) {
      cls += " start_clock";
    }
    if (paused_since) {
      cls += " paused";
    }

    if (main_time_div) {
      main_time_div.innerHTML = html;
    }

    return next_clock_update;
  };

  let updateTime = function() {
    now = Date.now();

    /* correct for when we used to store paused_since in terms of seconds instead of ms */
    if (paused_since > 0 && paused_since < 2000000000) {
      paused_since *= 1000;
    }

    let now_delta = sockets.getClockDrift();
    let lag = sockets.getNetworkLatency();

    if (phase !== "play" && phase !== "stone removal") {
      return;
    }

    let next_clock_update = 1000;

    if (clock.start_mode) {
      next_clock_update = formatTime(clock.black_player_id === clock.current_player ? 'black' : 'white', clock.expiration + now_delta, clock.last_move);
    } else {
      black_pause_text = null;
      white_pause_text = null;

      if (paused_since) {
        black_pause_text = ("Paused");
        white_pause_text = ("Paused");
        if (pause_control) {
          if ("weekend" in pause_control) {
            black_pause_text = ("Weekend");
            white_pause_text = ("Weekend");
          }
          if ("system" in pause_control) {
            black_pause_text = ("Paused by Server");
            white_pause_text = ("Paused by Server");
          }
          if (("vacation-" + clock.black_player_id) in pause_control) {
            black_pause_text = ("Vacation");
          }
          if (("vacation-" + clock.white_player_id) in pause_control) {
            white_pause_text = ("Vacation");
          }
        }
      }

      let black_base_time;
      let white_base_time;
      let pause_delta = clock.pause_delta || 0;
      if (paused_since) {
        black_base_time = (clock.current_player === clock.black_player_id ? (now - pause_delta)  - lag : now);
        white_base_time = (clock.current_player === clock.white_player_id ? (now - pause_delta)  - lag : now);
      } else {
        black_base_time = (clock.current_player === clock.black_player_id ? (clock.last_move + now_delta) - lag : now);
        white_base_time = (clock.current_player === clock.white_player_id ? (clock.last_move + now_delta) - lag : now);
      }

      if (clock.black_time) {
        let black_next_update = formatTime('black', clock.black_time, black_base_time, clock.black_player_id);
        if (clock.current_player === clock.black_player_id) {
          next_clock_update = black_next_update;
        }
      }
      if (clock.white_time) {
        let white_next_update = formatTime('white', clock.white_time, white_base_time, clock.white_player_id);
        if (clock.current_player === clock.white_player_id) {
          next_clock_update = white_next_update;
        }
      }
    }

    if (next_clock_update) {
      if (clock_timer) {
        clearTimeout(clock_timer);
        clock_timer = null;
      }
      clock_timer = setTimeout(updateTime, next_clock_update);
    }
  };

  updateTime();
}

function pad(n) {
  return (n < 10 && n > 0) ? ("0" + n) : n;
}

function shortDurationString(seconds) {
  let weeks = Math.floor(seconds / (86400 * 7)); seconds -= weeks * 86400 * 7;
  let days = Math.floor(seconds / 86400); seconds -= days * 86400;
  let hours = Math.floor(seconds / 3600); seconds -= hours * 3600;
  let minutes = Math.floor(seconds / 60); seconds -= minutes * 60;
  return "" +
    (weeks ? ` ${weeks}w` : "") +
    (days ? ` ${days}d` : "") +
    (hours ? ` ${hours}h` : "") +
    (minutes ? ` ${minutes}m` : "") +
    (seconds ? ` ${seconds}s` : "");
}
