const buildPrivateRoomId = (leftUserId, rightUserId) => [leftUserId, rightUserId].sort().join(':');

module.exports = {
  buildPrivateRoomId
};

