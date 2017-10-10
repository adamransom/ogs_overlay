const { Board, getMoveInterpretation } = require('./js/sabaki');
const { connectToGame, disconnect } = require('./js/ogs');

document.getElementById('game_id_form').addEventListener('submit', function(e) {
  e.preventDefault();

  const gameId = document.getElementById('game_id').value;
  connectToGame(gameId, true);
});

document.getElementById('game_id_form').addEventListener('reset', function(e) {
  e.preventDefault();

  disconnect();
});
