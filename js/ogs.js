const { getUserRating } = require('./rank_utils');
const { setOGSClock } = require('./clock');

let ws = null;

module.exports = function(gameId) {
  if (ws) {
    ws.close();
    ws = null;
  }

  ws = new WebSocket("wss://online-go.com/socket.io/?transport=websocket");

  ws.onopen = function() {
    console.info('WebSocket opened');
    // Connect to the game when the connection has been opened
    ws.send(`42["game/connect", { "game_id": ${gameId}, "chat": false }]`);
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
let phase;
let time_control;

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
  }
}

function handleGameData(data) {
  board = new Board();

  time_control = data.time_control;
  phase = data.phase;
  setClock(data.clock);
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
  document.getElementById(player + '_rank').innerHTML = '';

  fetch('https://online-go.com/api/v1/players/' + playerData.id).then(function(response) {
    return response.json();
  }).then(function(data) {
    const playerRank = getUserRating(data)
    document.getElementById(player + '_rank').innerHTML = playerRank.rank_label;
  }).catch(function(err) {
    console.error(err);
  });
}

function setClock(clock) {
  cur_player = clock.current_player == clock.black_player_id ? 1 : -1;
  setOGSClock(clock, phase, time_control);
}
