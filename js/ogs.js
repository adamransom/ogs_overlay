const { getUserRating } = require('./rank_utils');
const { setOGSClock } = require('./clock');
const sockets = require('./sockets');

let ws = null;

module.exports = function(gameId, fresh = false) {
  if (fresh) {
    reset();
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  ws = new WebSocket("wss://online-go.com/socket.io/?transport=websocket");

  ws.onopen = function() {
    console.info('WebSocket opened');
    // Connect to the game when the connection has been opened
    ws.send(`42["game/connect", { "game_id": ${gameId}, "chat": false }]`);
    sockets.ping(ws);
  }

  ws.onclose = function(event) {
    // Reconnect to the websocket when the connection has been closed
    if (!event.wasClean) {
      console.info('WebSocket closed unexpectedly');
      connectToGame(gameId);
    } else {
      console.info('WebSocket closed cleanly');
    }
  }

  ws.onmessage = function(message) {
    const json = message.data.replace(/^\d+/, '');

    if (json) {
      const data = JSON.parse(json);

      if (Array.isArray(data)) {
        handleEvent(data[0], data[1], gameId);
      }
    }
  }

  ws.onerror = console.error;
}

let board;
let cur_player = 0;
let pause_control;
let phase;
let time_control;

function reset() {
  document.getElementById("black").classList.remove('is-playing');
  document.getElementById("white").classList.remove('is-playing');
  document.getElementById('black_caps').innerHTML = 0;
  document.getElementById('white_caps').innerHTML = 0;
  document.getElementById('black_name').innerHTML = 'Black';
  document.getElementById('white_name').innerHTML = 'White';
  document.getElementById('black_rank').innerHTML = '';
  document.getElementById('white_rank').innerHTML = '';
  document.getElementById('move_name').innerHTML = '';
  document.getElementById("game").className = '';
  document.getElementById("outcome").innerHTML = '';
}

function handleEvent(event, data, gameId) {
  console.debug("Event: ", event);
  console.debug("Data: ", data);

  switch (event) {
    case `game/${gameId}/gamedata`:
      handleGameData(data);
      break;
    case `game/${gameId}/clock`:
      setClock(data);
      break;
    case `game/${gameId}/move`:
      handleMove(data);
      break;
    case 'net/pong':
      sockets.handlePong(data);
      break;
  }
}

function handleGameData(data) {
  board = new Board();

  time_control = data.time_control;
  pause_control = data.pause_control;
  phase = data.phase;

  document.getElementById('game').className = phase;

  if ('outcome' in data) {
    setOutcome(data);
  } else {
    setClock(data.clock);
  }
  setPlayers(data.players);

  let local_player = 1;
  let vertex;

  data.moves.forEach(function(move) {
    if (move[0] >= 0 && move[1] >= 0) {
      vertex = [move[0], move[1]];
      board = board.makeMove(local_player, vertex);
    }
    local_player *= -1;
  });

  setState(board, vertex);
}

function handleMove(data) {
  const vertex = [data.move[0], data.move[1]];
  board = board.makeMove(cur_player * -1, vertex);
  setState(board, vertex);
}

function setState(board, vertex) {
  document.getElementById('black_caps').innerHTML = board.captures[0];
  document.getElementById('white_caps').innerHTML = board.captures[1];
  document.getElementById('move_name').innerHTML = getMoveInterpretation(board, vertex);
}

function setPlayers(players) {
  setPlayer('black', players);
  setPlayer('white', players);
}

function setPlayer(player, players) {
  const playerData = players[player];
  const playerName = playerData.username;

  document.getElementById(player + '_name').innerHTML = playerName;

  fetch('https://online-go.com/api/v1/players/' + playerData.id).then(function(response) {
    return response.json();
  }).then(function(data) {
    const playerRank = getUserRating(data)
    document.getElementById(player + '_rank').innerHTML = playerRank.rank_label;
  }).catch(function(err) {
    console.error(err);
  });
}

function setOutcome(data) {
  let winner = 'Black';
  let other = 'white';

  if (data.winner != data.black_player_id) {
    winner = 'White';
    other = 'black';
  }

  if ('score' in data) {
    document.getElementById('black_score').innerHTML = data.score.black.total + ' points';
    document.getElementById('white_score').innerHTML = data.score.white.total + ' points';

    let diff = data.score[winner.toLowerCase()].total - data.score[other].total;
    document.getElementById('outcome').innerHTML = winner + ' wins by ' + diff + ' points';
  } else {
    document.getElementById('outcome').innerHTML = winner + ' wins by ' + data.outcome;
  }
}

function setClock(clock) {
  if (clock.current_player == clock.black_player_id) {
    cur_player = 1;
    document.getElementById("black").classList.add('is-playing');
    document.getElementById("white").classList.remove('is-playing');
  } else {
    cur_player = -1;
    document.getElementById("black").classList.remove('is-playing');
    document.getElementById("white").classList.add('is-playing');
  }

  setOGSClock(clock, phase, time_control, pause_control, sockets);
}
