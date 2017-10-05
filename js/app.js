function connectToGame(gameId) {
  const ws = new WebSocket("wss://online-go.com/socket.io/?transport=websocket");

  ws.onopen = function() {
    console.info('WebSocket opened');
    // Connect to the game when the connection has been opened
    ws.send(`42["game/connect", { "game_id": ${gameId}, "chat": false }]`);
  }

  ws.onclose = function() {
    console.info('WebSocket closed');
    // Reconnect to the websocket when the connection has been closed
    connectToGame(gameId);
  }

  ws.onmessage = function(message) {
    const json = message.data.replace(/^\d+/, '');

    if (json) {
      const data = JSON.parse(json);

      if (Array.isArray(data)) {
        handleEvent(data[0], data[1]);
      }
    }
  }

  ws.onerror = console.error;
}

function handleEvent(event, data) {
  console.debug("Event: ", event);
  console.debug("Data: ", data);
}

connectToGame(10189542);
