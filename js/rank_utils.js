class Rating {
}

const MinRank = 5;
const MaxRank = 38;

const MIN_RATING = 100;
const MAX_RATING = 6000;

rank_to_rating = function(rank) {
  return 850 * Math.exp(0.032 * rank);
}

rating_to_rank = function(rating) {
  return Math.log(Math.min(MAX_RATING, Math.max(MIN_RATING, rating)) / 850.0) / 0.032;
}

get_handicap_adjustment = function(rating, handicap) {
  return rank_to_rating(rating_to_rank(rating) + handicap) - rating;
}
function overall_rank(user_or_rank) {
  let rank = null;
  if (typeof(user_or_rank) === 'number') {
    rank = user_or_rank;
  } else {
    rank = getUserRating(user_or_rank, 'overall', 0).rank;
  }
  return rank;
}
is_novice = function(user_or_rank) {
  return overall_rank(user_or_rank) < MinRank;
}
is_rank_bounded = function(user_or_rank) {
  let rank = overall_rank(user_or_rank);
  return rank < MinRank || rank > MaxRank;
}
bounded_rank = function(user_or_rank) {
  let rank = overall_rank(user_or_rank);
  return Math.min(MaxRank, Math.max(MinRank, rank));
}
is_provisional = function(user) {
  let ratings = user.ratings || {};

  let rating = ratings['overall'] || {
    rating: 1500,
    deviation: 350,
    volatility: 0.06,
  };

  return rating.deviation >= 220;
}


exports.getUserRating = function(user, speed = 'overall', size = 0) {
  let ret = new Rating();
  let ratings = user.ratings || {};
  ret.professional = user.pro || user.professional;

  let key = speed;
  if (size > 0) {
    if (speed !== 'overall') {
      key += `-${size}x${size}`;
    } else {
      key = `${size}x${size}`;
    }
  }

  let rating = {
    rating: 1500,
    deviation: 350,
    volatility: 0.06,
  };
  ret.unset = true;
  if (key in ratings) {
    ret.unset = false;
    rating = ratings[key];
  }

  ret.rating = rating.rating;
  ret.deviation = rating.deviation;
  ret.volatility = rating.volatility;
  ret.rank = Math.floor(rating_to_rank(ret.rating));
  ret.rank_deviation = rating_to_rank(ret.rating + ret.deviation) - rating_to_rank(ret.rating);
  ret.partial_rank = rating_to_rank(ret.rating);
  ret.rank_label = rankString(ret.rank, false);
  ret.partial_rank_label = rankString(ret.partial_rank, true);
  ret.rank_deviation_labels = [
    rankString(rating_to_rank(ret.rating - ret.deviation), true),
    rankString(rating_to_rank(ret.rating + ret.deviation), true),
  ];
  ret.bounded_rank = Math.max(MinRank, Math.min(MaxRank, ret.rank));
  ret.bounded_rank_label = rankString(ret.bounded_rank);
  ret.partial_bounded_rank = Math.max(MinRank, Math.min(MaxRank, ret.partial_rank));
  ret.partial_bounded_rank_label = rankString(ret.partial_bounded_rank, true);
  if (ret.rank > (MaxRank + 1)) {
    ret.bounded_rank_label += '+';
    ret.partial_bounded_rank_label += '+';
  }

  if (ret.professional) {
    ret.rank_label = rankString(user);
    ret.bounded_rank_label = rankString(user);
    ret.partial_rank_label = ret.rank_label;
    ret.rank_deviation_labels = ['', ''];
  }

  return ret;
}

rankString = function(r) {
  let provisional = false;

  if (typeof(r) === "object") {
    provisional = is_provisional(r);

    let ranking = "ranking" in r ? r.ranking : r.rank;

    if (r.pro || r.professional) {
      return (ranking - 36) + 'p';
    }

    r = ranking;
  }

  if (r > 900) {
    return ((r - 1000) - 36) + 'p';
  }

  if (r < -900) {
    provisional = true;
  }

  if (provisional) {
    return "?";
  }

  if (r < 30) {
    return (30 - r).toFixed(0) + 'k';
  }

  return ((r - 30) + 1).toFixed(0) + 'd';
}

longRankString = function(r) {
  return rankString(r);
}
