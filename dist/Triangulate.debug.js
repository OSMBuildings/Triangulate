
(function(global) {

var earcut = (function() {

  function earcut(data, holeIndices, dim) {

    dim = dim || 2;

    var hasHoles = holeIndices && holeIndices.length,
      outerLen = hasHoles ? holeIndices[0]*dim : data.length,
      outerNode = linkedList(data, 0, outerLen, dim, true),
      triangles = [];

    if (!outerNode) return triangles;

    var minX, minY, maxX, maxY, x, y, size;

    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

    // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
    if (data.length>80*dim) {
      minX = maxX = data[0];
      minY = maxY = data[1];

      for (var i = dim; i<outerLen; i += dim) {
        x = data[i];
        y = data[i + 1];
        if (x<minX) minX = x;
        if (y<minY) minY = y;
        if (x>maxX) maxX = x;
        if (y>maxY) maxY = y;
      }

      // minX, minY and size are later used to transform coords into integers for z-order calculation
      size = Math.max(maxX - minX, maxY - minY);
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, size);

    return triangles;
  }

// create a circular doubly linked list from polygon points in the specified winding order
  function linkedList(data, start, end, dim, clockwise) {
    var sum = 0,
      i, j, last;

    // calculate original winding order of a polygon ring
    for (i = start, j = end - dim; i<end; i += dim) {
      sum += (data[j] - data[i])*(data[i + 1] + data[j + 1]);
      j = i;
    }

    // link points into circular doubly-linked list in the specified winding order
    if (clockwise === (sum>0)) {
      for (i = start; i<end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
      for (i = end - dim; i>=start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }

    return last;
  }

// eliminate colinear or duplicate points
  function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;

    var p = start,
      again;
    do {
      again = false;

      if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
        removeNode(p);
        p = end = p.prev;
        if (p === p.next) return null;
        again = true;

      } else {
        p = p.next;
      }
    } while (again || p !== end);

    return end;
  }

// main ear slicing loop which triangulates a polygon (given as a linked list)
  function earcutLinked(ear, triangles, dim, minX, minY, size, pass) {
    if (!ear) return;

    // interlink polygon nodes in z-order
    if (!pass && size) indexCurve(ear, minX, minY, size);

    var stop = ear,
      prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
      prev = ear.prev;
      next = ear.next;

      if (size ? isEarHashed(ear, minX, minY, size) : isEar(ear)) {
        // cut off the triangle
        triangles.push(prev.i/dim);
        triangles.push(ear.i/dim);
        triangles.push(next.i/dim);

        removeNode(ear);

        // skipping the next vertice leads to less sliver triangles
        ear = next.next;
        stop = next.next;

        continue;
      }

      ear = next;

      // if we looped through the whole remaining polygon and can't find any more ears
      if (ear === stop) {
        // try filtering points and slicing again
        if (!pass) {
          earcutLinked(filterPoints(ear), triangles, dim, minX, minY, size, 1);

          // if this didn't work, try curing all small self-intersections locally
        } else if (pass === 1) {
          ear = cureLocalIntersections(ear, triangles, dim);
          earcutLinked(ear, triangles, dim, minX, minY, size, 2);

          // as a last resort, try splitting the remaining polygon into two
        } else if (pass === 2) {
          splitEarcut(ear, triangles, dim, minX, minY, size);
        }

        break;
      }
    }
  }

// check whether a polygon node forms a valid ear with adjacent nodes
  function isEar(ear) {
    var a = ear.prev,
      b = ear,
      c = ear.next;

    if (area(a, b, c)>=0) return false; // reflex, can't be an ear

    // now make sure we don't have other points inside the potential ear
    var p = ear.next.next;

    while (p !== ear.prev) {
      if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
        area(p.prev, p, p.next)>=0) return false;
      p = p.next;
    }

    return true;
  }

  function isEarHashed(ear, minX, minY, size) {
    var a = ear.prev,
      b = ear,
      c = ear.next;

    if (area(a, b, c)>=0) return false; // reflex, can't be an ear

    // triangle bbox; min & max are calculated like this for speed
    var minTX = a.x<b.x ? (a.x<c.x ? a.x : c.x) : (b.x<c.x ? b.x : c.x),
      minTY = a.y<b.y ? (a.y<c.y ? a.y : c.y) : (b.y<c.y ? b.y : c.y),
      maxTX = a.x>b.x ? (a.x>c.x ? a.x : c.x) : (b.x>c.x ? b.x : c.x),
      maxTY = a.y>b.y ? (a.y>c.y ? a.y : c.y) : (b.y>c.y ? b.y : c.y);

    // z-order range for the current triangle bbox;
    var minZ = zOrder(minTX, minTY, minX, minY, size),
      maxZ = zOrder(maxTX, maxTY, minX, minY, size);

    // first look for points inside the triangle in increasing z-order
    var p = ear.nextZ;

    while (p && p.z<=maxZ) {
      if (p !== ear.prev && p !== ear.next &&
        pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
        area(p.prev, p, p.next)>=0) return false;
      p = p.nextZ;
    }

    // then look for points in decreasing z-order
    p = ear.prevZ;

    while (p && p.z>=minZ) {
      if (p !== ear.prev && p !== ear.next &&
        pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
        area(p.prev, p, p.next)>=0) return false;
      p = p.prevZ;
    }

    return true;
  }

// go through all polygon nodes and cure small local self-intersections
  function cureLocalIntersections(start, triangles, dim) {
    var p = start;
    do {
      var a = p.prev,
        b = p.next.next;

      // a self-intersection where edge (v[i-1],v[i]) intersects (v[i+1],v[i+2])
      if (intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

        triangles.push(a.i/dim);
        triangles.push(p.i/dim);
        triangles.push(b.i/dim);

        // remove two nodes involved
        removeNode(p);
        removeNode(p.next);

        p = start = b;
      }
      p = p.next;
    } while (p !== start);

    return p;
  }

// try splitting polygon into two and triangulate them independently
  function splitEarcut(start, triangles, dim, minX, minY, size) {
    // look for a valid diagonal that divides the polygon into two
    var a = start;
    do {
      var b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && isValidDiagonal(a, b)) {
          // split the polygon in two by the diagonal
          var c = splitPolygon(a, b);

          // filter colinear points around the cuts
          a = filterPoints(a, a.next);
          c = filterPoints(c, c.next);

          // run earcut on each half
          earcutLinked(a, triangles, dim, minX, minY, size);
          earcutLinked(c, triangles, dim, minX, minY, size);
          return;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }

// link every hole into the outer loop, producing a single-ring polygon without holes
  function eliminateHoles(data, holeIndices, outerNode, dim) {
    var queue = [],
      i, len, start, end, list;

    for (i = 0, len = holeIndices.length; i<len; i++) {
      start = holeIndices[i]*dim;
      end = i<len - 1 ? holeIndices[i + 1]*dim : data.length;
      list = linkedList(data, start, end, dim, false);
      if (list === list.next) list.steiner = true;
      queue.push(getLeftmost(list));
    }

    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i<queue.length; i++) {
      eliminateHole(queue[i], outerNode);
      outerNode = filterPoints(outerNode, outerNode.next);
    }

    return outerNode;
  }

  function compareX(a, b) {
    return a.x - b.x;
  }

// find a bridge between vertices that connects hole with an outer ring and and link it
  function eliminateHole(hole, outerNode) {
    outerNode = findHoleBridge(hole, outerNode);
    if (outerNode) {
      var b = splitPolygon(outerNode, hole);
      filterPoints(b, b.next);
    }
  }

// David Eberly's algorithm for finding a bridge between hole and outer polygon
  function findHoleBridge(hole, outerNode) {
    var p = outerNode,
      hx = hole.x,
      hy = hole.y,
      qx = -Infinity,
      m;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    do {
      if (hy<=p.y && hy>=p.next.y) {
        var x = p.x + (hy - p.y)*(p.next.x - p.x)/(p.next.y - p.y);
        if (x<=hx && x>qx) {
          qx = x;
          m = p.x<p.next.x ? p : p.next;
        }
      }
      p = p.next;
    } while (p !== outerNode);

    if (!m) return null;

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    var stop = m,
      tanMin = Infinity,
      tan;

    p = m.next;

    while (p !== stop) {
      if (hx>=p.x && p.x>=m.x &&
        pointInTriangle(hy<m.y ? hx : qx, hy, m.x, m.y, hy<m.y ? qx : hx, hy, p.x, p.y)) {

        tan = Math.abs(hy - p.y)/(hx - p.x); // tangential

        if ((tan<tanMin || (tan === tanMin && p.x>m.x)) && locallyInside(p, hole)) {
          m = p;
          tanMin = tan;
        }
      }

      p = p.next;
    }

    return m;
  }

// interlink polygon nodes in z-order
  function indexCurve(start, minX, minY, size) {
    var p = start;
    do {
      if (p.z === null) p.z = zOrder(p.x, p.y, minX, minY, size);
      p.prevZ = p.prev;
      p.nextZ = p.next;
      p = p.next;
    } while (p !== start);

    p.prevZ.nextZ = null;
    p.prevZ = null;

    sortLinked(p);
  }

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
  function sortLinked(list) {
    var i, p, q, e, tail, numMerges, pSize, qSize,
      inSize = 1;

    do {
      p = list;
      list = null;
      tail = null;
      numMerges = 0;

      while (p) {
        numMerges++;
        q = p;
        pSize = 0;
        for (i = 0; i<inSize; i++) {
          pSize++;
          q = q.nextZ;
          if (!q) break;
        }

        qSize = inSize;

        while (pSize>0 || (qSize>0 && q)) {

          if (pSize === 0) {
            e = q;
            q = q.nextZ;
            qSize--;
          } else if (qSize === 0 || !q) {
            e = p;
            p = p.nextZ;
            pSize--;
          } else if (p.z<=q.z) {
            e = p;
            p = p.nextZ;
            pSize--;
          } else {
            e = q;
            q = q.nextZ;
            qSize--;
          }

          if (tail) tail.nextZ = e;
          else list = e;

          e.prevZ = tail;
          tail = e;
        }

        p = q;
      }

      tail.nextZ = null;
      inSize *= 2;

    } while (numMerges>1);

    return list;
  }

// z-order of a point given coords and size of the data bounding box
  function zOrder(x, y, minX, minY, size) {
    // coords are transformed into non-negative 15-bit integer range
    x = 32767*(x - minX)/size;
    y = 32767*(y - minY)/size;

    x = (x | (x<<8)) & 0x00FF00FF;
    x = (x | (x<<4)) & 0x0F0F0F0F;
    x = (x | (x<<2)) & 0x33333333;
    x = (x | (x<<1)) & 0x55555555;

    y = (y | (y<<8)) & 0x00FF00FF;
    y = (y | (y<<4)) & 0x0F0F0F0F;
    y = (y | (y<<2)) & 0x33333333;
    y = (y | (y<<1)) & 0x55555555;

    return x | (y<<1);
  }

// find the leftmost node of a polygon ring
  function getLeftmost(start) {
    var p = start,
      leftmost = start;
    do {
      if (p.x<leftmost.x) leftmost = p;
      p = p.next;
    } while (p !== start);

    return leftmost;
  }

// check if a point lies within a convex triangle
  function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px)*(ay - py) - (ax - px)*(cy - py)>=0 &&
      (ax - px)*(by - py) - (bx - px)*(ay - py)>=0 &&
      (bx - px)*(cy - py) - (cx - px)*(by - py)>=0;
  }

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
  function isValidDiagonal(a, b) {
    return equals(a, b) || a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
      locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b);
  }

// signed area of a triangle
  function area(p, q, r) {
    return (q.y - p.y)*(r.x - q.x) - (q.x - p.x)*(r.y - q.y);
  }

// check if two points are equal
  function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
  }

// check if two segments intersect
  function intersects(p1, q1, p2, q2) {
    return area(p1, q1, p2)>0 !== area(p1, q1, q2)>0 &&
      area(p2, q2, p1)>0 !== area(p2, q2, q1)>0;
  }

// check if a polygon diagonal intersects any polygon segments
  function intersectsPolygon(a, b) {
    var p = a;
    do {
      if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
        intersects(p, p.next, a, b)) return true;
      p = p.next;
    } while (p !== a);

    return false;
  }

// check if a polygon diagonal is locally inside the polygon
  function locallyInside(a, b) {
    return area(a.prev, a, a.next)<0 ?
    area(a, b, a.next)>=0 && area(a, a.prev, b)>=0 :
    area(a, b, a.prev)<0 || area(a, a.next, b)<0;
  }

// check if the middle point of a polygon diagonal is inside the polygon
  function middleInside(a, b) {
    var p = a,
      inside = false,
      px = (a.x + b.x)/2,
      py = (a.y + b.y)/2;
    do {
      if (((p.y>py) !== (p.next.y>py)) && (px<(p.next.x - p.x)*(py - p.y)/(p.next.y - p.y) + p.x))
        inside = !inside;
      p = p.next;
    } while (p !== a);

    return inside;
  }

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
  function splitPolygon(a, b) {
    var a2 = new Node(a.i, a.x, a.y),
      b2 = new Node(b.i, b.x, b.y),
      an = a.next,
      bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return b2;
  }

// create a node and optionally link it with previous one (in a circular doubly linked list)
  function insertNode(i, x, y, last) {
    var p = new Node(i, x, y);

    if (!last) {
      p.prev = p;
      p.next = p;

    } else {
      p.next = last.next;
      p.prev = last;
      last.next.prev = p;
      last.next = p;
    }
    return p;
  }

  function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;

    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
  }

  function Node(i, x, y) {
    // vertice index in coordinates array
    this.i = i;

    // vertex coordinates
    this.x = x;
    this.y = y;

    // previous and next vertice nodes in a polygon ring
    this.prev = null;
    this.next = null;

    // z-order curve value
    this.z = null;

    // previous and next nodes in z-order
    this.prevZ = null;
    this.nextZ = null;

    // indicates whether this is a steiner point
    this.steiner = false;
  }

  return earcut;

}());

var Color = (function(window) {


var w3cColors = {
aliceblue: '#f0f8ff',
antiquewhite: '#faebd7',
aqua: '#00ffff',
aquamarine: '#7fffd4',
azure: '#f0ffff',
beige: '#f5f5dc',
bisque: '#ffe4c4',
black: '#000000',
blanchedalmond: '#ffebcd',
blue: '#0000ff',
blueviolet: '#8a2be2',
brown: '#a52a2a',
burlywood: '#deb887',
cadetblue: '#5f9ea0',
chartreuse: '#7fff00',
chocolate: '#d2691e',
coral: '#ff7f50',
cornflowerblue: '#6495ed',
cornsilk: '#fff8dc',
crimson: '#dc143c',
cyan: '#00ffff',
darkblue: '#00008b',
darkcyan: '#008b8b',
darkgoldenrod: '#b8860b',
darkgray: '#a9a9a9',
darkgrey: '#a9a9a9',
darkgreen: '#006400',
darkkhaki: '#bdb76b',
darkmagenta: '#8b008b',
darkolivegreen: '#556b2f',
darkorange: '#ff8c00',
darkorchid: '#9932cc',
darkred: '#8b0000',
darksalmon: '#e9967a',
darkseagreen: '#8fbc8f',
darkslateblue: '#483d8b',
darkslategray: '#2f4f4f',
darkslategrey: '#2f4f4f',
darkturquoise: '#00ced1',
darkviolet: '#9400d3',
deeppink: '#ff1493',
deepskyblue: '#00bfff',
dimgray: '#696969',
dimgrey: '#696969',
dodgerblue: '#1e90ff',
firebrick: '#b22222',
floralwhite: '#fffaf0',
forestgreen: '#228b22',
fuchsia: '#ff00ff',
gainsboro: '#dcdcdc',
ghostwhite: '#f8f8ff',
gold: '#ffd700',
goldenrod: '#daa520',
gray: '#808080',
grey: '#808080',
green: '#008000',
greenyellow: '#adff2f',
honeydew: '#f0fff0',
hotpink: '#ff69b4',
indianred : '#cd5c5c',
indigo : '#4b0082',
ivory: '#fffff0',
khaki: '#f0e68c',
lavender: '#e6e6fa',
lavenderblush: '#fff0f5',
lawngreen: '#7cfc00',
lemonchiffon: '#fffacd',
lightblue: '#add8e6',
lightcoral: '#f08080',
lightcyan: '#e0ffff',
lightgoldenrodyellow: '#fafad2',
lightgray: '#d3d3d3',
lightgrey: '#d3d3d3',
lightgreen: '#90ee90',
lightpink: '#ffb6c1',
lightsalmon: '#ffa07a',
lightseagreen: '#20b2aa',
lightskyblue: '#87cefa',
lightslategray: '#778899',
lightslategrey: '#778899',
lightsteelblue: '#b0c4de',
lightyellow: '#ffffe0',
lime: '#00ff00',
limegreen: '#32cd32',
linen: '#faf0e6',
magenta: '#ff00ff',
maroon: '#800000',
mediumaquamarine: '#66cdaa',
mediumblue: '#0000cd',
mediumorchid: '#ba55d3',
mediumpurple: '#9370db',
mediumseagreen: '#3cb371',
mediumslateblue: '#7b68ee',
mediumspringgreen: '#00fa9a',
mediumturquoise: '#48d1cc',
mediumvioletred: '#c71585',
midnightblue: '#191970',
mintcream: '#f5fffa',
mistyrose: '#ffe4e1',
moccasin: '#ffe4b5',
navajowhite: '#ffdead',
navy: '#000080',
oldlace: '#fdf5e6',
olive: '#808000',
olivedrab: '#6b8e23',
orange: '#ffa500',
orangered: '#ff4500',
orchid: '#da70d6',
palegoldenrod: '#eee8aa',
palegreen: '#98fb98',
paleturquoise: '#afeeee',
palevioletred: '#db7093',
papayawhip: '#ffefd5',
peachpuff: '#ffdab9',
peru: '#cd853f',
pink: '#ffc0cb',
plum: '#dda0dd',
powderblue: '#b0e0e6',
purple: '#800080',
rebeccapurple: '#663399',
red: '#ff0000',
rosybrown: '#bc8f8f',
royalblue: '#4169e1',
saddlebrown: '#8b4513',
salmon: '#fa8072',
sandybrown: '#f4a460',
seagreen: '#2e8b57',
seashell: '#fff5ee',
sienna: '#a0522d',
silver: '#c0c0c0',
skyblue: '#87ceeb',
slateblue: '#6a5acd',
slategray: '#708090',
slategrey: '#708090',
snow: '#fffafa',
springgreen: '#00ff7f',
steelblue: '#4682b4',
tan: '#d2b48c',
teal: '#008080',
thistle: '#d8bfd8',
tomato: '#ff6347',
turquoise: '#40e0d0',
violet: '#ee82ee',
wheat: '#f5deb3',
white: '#ffffff',
whitesmoke: '#f5f5f5',
yellow: '#ffff00',
yellowgreen: '#9acd32'
};

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q-p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q-p) * (2/3 - t) * 6;
  return p;
}

function clamp(v, max) {
  return Math.min(max, Math.max(0, v || 0));
}

/**
 * @param str, object can be in any of these: 'red', '#0099ff', 'rgb(64, 128, 255)', 'rgba(64, 128, 255, 0.5)', { r:0.2, g:0.3, b:0.9, a:1 }
 */
var Color = function(str) {
  str = str || '';

  if (typeof str === 'object') {
    var rgba = str;
    this.R = clamp(rgba.r, max);
    this.G = clamp(rgba.g, max);
    this.B = clamp(rgba.b, max);
    this.A = (rgba.a !== undefined ? clamp(rgba.a, 1) : 1);
    this.isValid = true;
  } else if (typeof str === 'string') {
    str = str.toLowerCase();
    str = w3cColors[str] || str;
    var m;
    if ((m = str.match(/^#?(\w{2})(\w{2})(\w{2})$/))) {
      this.R = parseInt(m[1], 16) / 255;
      this.G = parseInt(m[2], 16) / 255;
      this.B = parseInt(m[3], 16) / 255;
      this.A = 1;
      this.isValid = true;
    } else if ((m = str.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)(\D+([\d.]+))?\)/))) {
      this.R = parseInt(m[1], 10) / 255;
      this.G = parseInt(m[2], 10) / 255;
      this.B = parseInt(m[3], 10) / 255;
      this.A = m[4] ? parseFloat(m[5]) : 1;
      this.isValid = true;
    }
  }
};

Color.prototype = {

  toHSL: function() {
    var
      max = Math.max(this.R, this.G, this.B),
      min = Math.min(this.R, this.G, this.B),
      h, s, l = (max+min) / 2,
      d = max-min;

    if (!d) {
      h = s = 0; // achromatic
    } else {
      s = l > 0.5 ? d / (2-max-min) : d / (max+min);
      switch (max) {
        case this.R: h = (this.G-this.B) / d + (this.G < this.B ? 6 : 0); break;
        case this.G: h = (this.B-this.R) / d + 2; break;
        case this.B: h = (this.R-this.G) / d + 4; break;
      }
      h *= 60;
    }

    return { h:h, s:s, l:l };
  },

  fromHSL: function(hsl) {
  // h = clamp(hsl.h, 360),
  // s = clamp(hsl.s, 1),
  // l = clamp(hsl.l, 1),

    // achromatic
    if (hsl.s === 0) {
      this.R = hsl.l;
      this.G = hsl.l;
      this.B = hsl.l;
    } else {
      var
        q = hsl.l < 0.5 ? hsl.l * (1+hsl.s) : hsl.l + hsl.s - hsl.l*hsl.s,
        p = 2 * hsl.l-q;
      hsl.h /= 360;
      this.R = hue2rgb(p, q, hsl.h + 1/3);
      this.G = hue2rgb(p, q, hsl.h);
      this.B = hue2rgb(p, q, hsl.h - 1/3);
    }

    return this;
  },

  toString: function() {
    if (this.A === 1) {
      return '#' + ((1 <<24) + (Math.round(this.R*255) <<16) + (Math.round(this.G*255) <<8) + Math.round(this.B*255)).toString(16).slice(1, 7);
    }
    return 'rgba(' + [Math.round(this.R*255), Math.round(this.G*255), Math.round(this.B*255), this.A.toFixed(2)].join(',') + ')';
  },

  toArray: function() {
    return [this.R, this.G, this.B];
  },

  hue: function(h) {
    var hsl = this.toHSL();
    hsl.h *= h;
    this.fromHSL(hsl);
    return this;
  },

  saturation: function(s) {
    debugger
    var hsl = this.toHSL();
    hsl.s *= s;
    this.fromHSL(hsl);
    return this;
  },

  lightness: function(l) {
    var hsl = this.toHSL();
    hsl.l *= l;
    this.fromHSL(hsl);
    return this;
  },

  alpha: function(a) {
    this.A *= a;
    return this;
  }
};
return Color; }(this));

var Triangulate = {

  NUM_Y_SEGMENTS: 24,
  NUM_X_SEGMENTS: 32,

  //function isVertical(a, b, c) {
  //  return Math.abs(normal(a, b, c)[2]) < 1/5000;
  //}

  quad: function(data, a, b, c, d, color) {
    this.triangle(data, a, b, c, color);
    this.triangle(data, c, d, a, color);
  },

  triangle: function(data, a, b, c, color) {
    var n = normal(a, b, c);
    [].push.apply(data.vertices, [].concat(a, c, b));
    [].push.apply(data.normals,  [].concat(n, n, n));
    [].push.apply(data.colors,   [].concat(color, color, color));
    data.texCoords.push(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  },

  circle: function(data, center, radius, Z, color) {
    Z = Z || 0;
    var u, v;
    for (var i = 0; i < this.NUM_X_SEGMENTS; i++) {
      u = i/this.NUM_X_SEGMENTS;
      v = (i+1)/this.NUM_X_SEGMENTS;
      this.triangle(
        data,
        [ center[0] + radius * Math.sin(u*Math.PI*2), center[1] + radius * Math.cos(u*Math.PI*2), Z ],
        [ center[0],                                  center[1],                                  Z ],
        [ center[0] + radius * Math.sin(v*Math.PI*2), center[1] + radius * Math.cos(v*Math.PI*2), Z ],
        color
      );
    }
  },

  polygon: function(data, rings, Z, color) {
    Z = Z || 0;
    // flatten data
    var
      inVertices = [], inHoleIndex = [],
      index = 0,
      i, il;
    for (i = 0, il = rings.length; i < il; i++) {
      for (var j = 0; j < rings[i].length; j++) {
        inVertices.push(rings[i][j][0], rings[i][j][1]);
      }
      if (i) {
        index += rings[i - 1].length;
        inHoleIndex.push(index);
      }
    }

    var vertices = earcut(inVertices, inHoleIndex, 2);

    for (i = 0, il = vertices.length-2; i < il; i+=3) {
      this.triangle(
        data,
        [ inVertices[ vertices[i  ]*2 ], inVertices[ vertices[i  ]*2+1 ], Z ],
        [ inVertices[ vertices[i+1]*2 ], inVertices[ vertices[i+1]*2+1 ], Z ],
        [ inVertices[ vertices[i+2]*2 ], inVertices[ vertices[i+2]*2+1 ], Z ],
        color
      );
    }
  },

  //polygon3d: function(data, rings, color) {
  //  var ring = rings[0];
  //  var ringLength = ring.length;
  //  var vertices, t, tl;
  //
////  { r:255, g:0, b:0 }
//
  //  if (ringLength <= 4) { // 3: a triangle
  //    this.triangle(
  //      data,
  //      ring[0],
  //      ring[2],
  //      ring[1], color
  //    );
  //
  //    if (ringLength === 4) { // 4: a quad (2 triangles)
  //      this.triangle(
  //        data,
  //        ring[0],
  //        ring[3],
  //        ring[2], color
  //      );
  //    }
//      return;
  //  }
  //
  //  if (isVertical(ring[0], ring[1], ring[2])) {
  //    for (var i = 0, il = rings[0].length; i < il; i++) {
  //      rings[0][i] = [
  //        rings[0][i][2],
  //        rings[0][i][1],
  //        rings[0][i][0]
  //      ];
  //    }
  //
  //    vertices = earcut(rings);
  //    for (t = 0, tl = vertices.length-2; t < tl; t+=3) {
  //      this.triangle(
  //        data,
  //        [ vertices[t  ][2], vertices[t  ][1], vertices[t  ][0] ],
  //        [ vertices[t+1][2], vertices[t+1][1], vertices[t+1][0] ],
  //        [ vertices[t+2][2], vertices[t+2][1], vertices[t+2][0] ], color
  //      );
  //    }
//      return;
  //  }
  //
  //  vertices = earcut(rings);
  //  for (t = 0, tl = vertices.length-2; t < tl; t+=3) {
  //    this.triangle(
  //      data,
  //      [ vertices[t  ][0], vertices[t  ][1], vertices[t  ][2] ],
  //      [ vertices[t+1][0], vertices[t+1][1], vertices[t+1][2] ],
  //      [ vertices[t+2][0], vertices[t+2][1], vertices[t+2][2] ], color
  //    );
  //  }
  //},

  cube: function(data, sizeX, sizeY, sizeZ, X, Y, Z, color) {
    X = X || 0;
    Y = Y || 0;
    Z = Z || 0;

    var a = [X,       Y,       Z];
    var b = [X+sizeX, Y,       Z];
    var c = [X+sizeX, Y+sizeY, Z];
    var d = [X,       Y+sizeY, Z];

    var A = [X,       Y,       Z+sizeZ];
    var B = [X+sizeX, Y,       Z+sizeZ];
    var C = [X+sizeX, Y+sizeY, Z+sizeZ];
    var D = [X,       Y+sizeY, Z+sizeZ];

    this.quad(data, b, a, d, c, color);
    this.quad(data, A, B, C, D, color);
    this.quad(data, a, b, B, A, color);
    this.quad(data, b, c, C, B, color);
    this.quad(data, c, d, D, C, color);
    this.quad(data, d, a, A, D, color);
  },

  cylinder: function(data, center, radius1, radius2, height, Z, color) {
    Z = Z || 0;
    var
      currAngle, nextAngle,
      currSin, currCos,
      nextSin, nextCos,
      num = this.NUM_X_SEGMENTS,
      doublePI = Math.PI*2;

    for (var i = 0; i < num; i++) {
      currAngle = ( i   /num) * doublePI;
      nextAngle = ((i+1)/num) * doublePI;

      currSin = Math.sin(currAngle);
      currCos = Math.cos(currAngle);

      nextSin = Math.sin(nextAngle);
      nextCos = Math.cos(nextAngle);

      this.triangle(
        data,
        [ center[0] + radius1*currSin, center[1] + radius1*currCos, Z ],
        [ center[0] + radius2*nextSin, center[1] + radius2*nextCos, Z+height ],
        [ center[0] + radius1*nextSin, center[1] + radius1*nextCos, Z ],
        color
      );

      if (radius2 !== 0) {
        this.triangle(
          data,
          [ center[0] + radius2*currSin, center[1] + radius2*currCos, Z+height ],
          [ center[0] + radius2*nextSin, center[1] + radius2*nextCos, Z+height ],
          [ center[0] + radius1*currSin, center[1] + radius1*currCos, Z ],
          color
        );
      }
    }
  },

  dome: function(data, center, radius, height, Z, color) {
    Z = Z || 0;
    var
      currAngle, nextAngle,
      currSin, currCos,
      nextSin, nextCos,
      currRadius, nextRadius,
      nextHeight, nextZ,
      num = this.NUM_Y_SEGMENTS/2,
      halfPI = Math.PI/2;

    for (var i = 0; i < num; i++) {
      currAngle = ( i   /num) * halfPI - halfPI;
      nextAngle = ((i+1)/num) * halfPI - halfPI;

      currSin = Math.sin(currAngle);
      currCos = Math.cos(currAngle);

      nextSin = Math.sin(nextAngle);
      nextCos = Math.cos(nextAngle);

      currRadius = currCos*radius;
      nextRadius = nextCos*radius;

      nextHeight = (nextSin-currSin)*height;
      nextZ = Z - nextSin*height;

      this.cylinder(data, center, nextRadius, currRadius, nextHeight, nextZ, color);
    }
  },

  // TODO
  sphere: function(data, center, radius, height, Z, color) {
    Z = Z || 0;
    return this.cylinder(data, center, radius, radius, height, Z, color);
  },

  pyramid: function(data, polygon, center, height, Z, color) {
    Z = Z || 0;
    polygon = polygon[0];
    for (var i = 0, il = polygon.length-1; i < il; i++) {
      this.triangle(
        data,
        [ polygon[i  ][0], polygon[i  ][1], Z ],
        [ polygon[i+1][0], polygon[i+1][1], Z ],
        [ center[0], center[1], Z+height ],
        color
      );
    }
  },

  extrusion: function(data, polygon, height, Z, color, tx) {
    Z = Z || 0;
    var
      ring, last, a, b,
      L,
      v0, v1, v2, v3, n,
      tx1, tx2,
      ty1 = tx[2]*height, ty2 = tx[3]*height;

    for (var i = 0, il = polygon.length; i < il; i++) {
      ring = polygon[i];
      last = ring.length-1;

      if (ring[0][0] !== ring[last][0] || ring[0][1] !== ring[last][1]) {
        ring.push(ring[0]);
        last++;
      }

      for (var r = 0; r < last; r++) {
        a = ring[r];
        b = ring[r+1];
        L = len2(sub2(a, b));

        tx1 = (tx[0]*L) <<0;
        tx2 = (tx[1]*L) <<0;

        v0 = [ a[0], a[1], Z];
        v1 = [ b[0], b[1], Z];
        v2 = [ b[0], b[1], Z+height];
        v3 = [ a[0], a[1], Z+height];

        n = normal(v0, v1, v2);
        [].push.apply(data.vertices, [].concat(v0, v2, v1, v0, v3, v2));
        [].push.apply(data.normals,  [].concat(n, n, n, n, n, n));
        [].push.apply(data.colors,   [].concat(color, color, color, color, color, color));

        data.texCoords.push(
          tx1, ty2,
          tx2, ty1,
          tx2, ty2,
          tx1, ty2,
          tx1, ty1,
          tx2, ty1
        );
      }
    }
  }
};
if (typeof global.define === 'function') {
global.define([], Triangulate);
} else if (typeof global.exports === 'object') {
global.module.exports = Triangulate;
} else {
global.Triangulate = Triangulate;
}

}(this));
