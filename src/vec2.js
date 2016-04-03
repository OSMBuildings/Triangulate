
var vec2 = {
  len: function(a) {
    return Math.sqrt(a[0]*a[0] + a[1]*a[1]);
  },

  sub: function(a, b) {
    return [a[0]-b[0], a[1]-b[1]];
  }
};
