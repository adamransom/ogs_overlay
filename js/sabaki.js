// --------
// Board.js
// --------
const alpha = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

class Board {
  constructor(width = 19, height = 19, arrangement = [], captures = null) {
    this.width = width
    this.height = height
    this.captures = captures ? captures.slice() : [0, 0]
    this.arrangement = []
    this.markups = {}
    this.ghosts = {}
    this.lines = []

    // Initialize arrangement

    for (let y = 0; y < this.height; y++) {
      this.arrangement[y] = y in arrangement ? [...arrangement[y]] : Array(this.width).fill(0)
    }
  }

  get([x, y]) {
    return this.arrangement[y] ? this.arrangement[y][x] : undefined
  }

  set([x, y], sign) {
    this.arrangement[y][x] = sign
    return this
  }

  clone() {
    return new Board(this.width, this.height, this.arrangement, this.captures)
  }

  diff(board) {
    let result = []

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        let sign = board.get([x, y])
        if (this.get([x, y]) === sign) continue

        result.push([x, y])
      }
    }

    return result
  }

  hasVertex(vert) {
    if (!vert) return false;
    const x = vert[0];
    const y = vert[1];
    return 0 <= x && x < this.width && 0 <= y && y < this.height
  }

  clear() {
    this.arrangement = this.arrangement.map(_ => Array(this.width).fill(0))
  }

  isSquare() {
    return this.width === this.height
  }

  getDistance(v, w) {
    return Math.abs(v[0] - w[0]) + Math.abs(v[1] - w[1])
  }

  getDistanceToGround(vertex) {
    return this.getCanonicalVertex(vertex)[0]
  }

  getCanonicalVertex(vertex) {
    if (!this.hasVertex(vertex)) return [-1, -1]

    let boardSize = [this.width, this.height]

    return vertex.map((x, i) => Math.min(x, boardSize[i] - x - 1))
      .sort((x, y) => x - y)
  }

  getNeighbors(vertex, ignoreBoard = false) {
    if (!ignoreBoard && !this.hasVertex(vertex)) return []

    let [x, y] = vertex
    let allNeighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]

    return ignoreBoard ? allNeighbors : allNeighbors.filter(v => this.hasVertex(v))
  }

  getConnectedComponent(vertex, func, result = null) {
    if (func instanceof Array) {
      let signs = func
      func = v => signs.includes(this.get(v))
    } else if (typeof func === 'number') {
      let sign = func
      func = v => this.get(v) === sign
    }

    if (!this.hasVertex(vertex)) return []
    if (!result) result = [vertex]

    // Recursive depth-first search

    for (let v of this.getNeighbors(vertex)) {
      if (!func(v)) continue
      if (result.some(w => vertexEquals(v, w))) continue

      result.push(v)
      this.getConnectedComponent(v, func, result)
    }

    return result
  }

  getChain(vertex) {
    return this.getConnectedComponent(vertex, this.get(vertex))
  }

  hasLiberties(vertex, visited = {}) {
    let sign = this.get(vertex)
    if (!this.hasVertex(vertex) || sign === 0) return false

    if (vertex in visited) return false
    let neighbors = this.getNeighbors(vertex)

    if (neighbors.some(n => this.get(n) === 0))
      return true

    visited[vertex] = true

    return neighbors.filter(n => this.get(n) === sign)
      .some(n => this.hasLiberties(n, visited))
  }

  getLiberties(vertex) {
    if (!this.hasVertex(vertex) || this.get(vertex) === 0) return []

    let chain = this.getChain(vertex)
    let liberties = []
    let added = {}

    for (let c of chain) {
      let freeNeighbors = this.getNeighbors(c).filter(n => this.get(n) === 0)

      liberties.push(...freeNeighbors.filter(n => !(n in added)))
      freeNeighbors.forEach(n => added[n] = true)
    }

    return liberties
  }

  getRelatedChains(vertex) {
    if (!this.hasVertex(vertex) || this.get(vertex) === 0) return []

    let area = this.getConnectedComponent(vertex, [this.get(vertex), 0])
    return area.filter(v => this.get(v) === this.get(vertex))
  }

  getAreaMap() {
    let map = [...Array(this.height)].map(_ => Array(this.width).fill(null))

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        let vertex = [x, y]

        if (map[y][x] != null) continue
        if (this.get(vertex) !== 0) {
          map[y][x] = this.get(vertex)
          continue
        }

        let chain = this.getChain(vertex)
        let sign = 0
        let indicator = 1

        for (let c of chain) {
          if (indicator === 0) break

          for (let n of this.getNeighbors(c)) {
            if (indicator === 0) break
            if (this.get(n) === 0) continue

            let [i, j] = n
            if (sign === 0) sign = map[j][i] = this.get(n)
            else if (sign !== this.get(n)) indicator = 0
          }
        }

        for (let [i, j] of chain) {
          map[j][i] = sign * indicator
        }
      }
    }

    return map
  }

  getAreaEstimateMap() {
    let map = this.getAreaMap()

    let pnnmap = this.getNearestNeighborMap(1)
    let nnnmap = this.getNearestNeighborMap(-1)
    let pimap = this.getInfluenceMap(1)
    let nimap = this.getInfluenceMap(-1)

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (map[y][x] !== 0) continue

        let s = Math.sign(nnnmap[y][x] - pnnmap[y][x])
        if (s > 0 && pnnmap[y][x] > 6 || s < 0 && nnnmap[y][x] > 6
          || s > 0 && Math.round(pimap[y][x]) < 2 || s < 0 && Math.round(nimap[y][x]) < 2)
          s = 0

        map[y][x] = s
      }
    }

    // Fix holes and prevent single point areas

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        let neighbors = this.getNeighbors([x, y])
        if (neighbors.length === 0) continue

        let [i, j] = neighbors[0]
        let s = map[y][x] === 0 ? map[j][i] : 0

        if (neighbors.every(([i, j]) => map[j][i] === s))
          map[y][x] = s
      }
    }

    return map
  }

  getNearestNeighborMap(sign) {
    let map = [...Array(this.height)].map(_ => Array(this.width).fill(Infinity))
    let min = Infinity

    let f = (x, y) => {
      let v = [x, y]
      if (this.get(v) === sign) min = 0
      else if (this.get(v) === 0) min++
      else min = Infinity

      map[y][x] = min = Math.min(min, map[y][x])
    }

    for (let y = 0; y < this.height; y++) {
      min = Infinity

      for (let x = 0; x < this.width; x++) {
        let old = Infinity

        f(x, y)
        old = min

        for (let ny = y + 1; ny < this.height; ny++) f(x, ny)
        min = old

        for (let ny = y - 1; ny >= 0; ny--) f(x, ny)
        min = old
      }
    }

    for (let y = this.height - 1; y >= 0; y--) {
      min = Infinity

      for (let x = this.width - 1; x >= 0; x--) {
        let old = Infinity

        f(x, y)
        old = min

        for (let ny = y + 1; ny < this.height; ny++) f(x, ny)
        min = old

        for (let ny = y - 1; ny >= 0; ny--) f(x, ny)
        min = old
      }
    }

    return map
  }

  getInfluenceMap(sign) {
    let map = [...Array(this.height)].map(_ => Array(this.width).fill(0))
    let size = [this.width, this.height]
    let done = []

    // Cast influence

    let getVertex = v => {
      if (this.hasVertex(v)) return v
      return v.map((z, i) => z < 0 ? -z - 1 : z >= size[i] ? 2 * size[i] - z - 1 : z)
    }

    let castInfluence = (chain, distance) => {
      let queue = chain.map(x => [x, 0])
      let visited = []

      while (queue.length > 0) {
        let [v, d] = queue.shift()
        let [x, y] = getVertex(v)

        map[y][x] += !this.hasVertex(v) ? 2 : 1.5 / (d / distance * 6 + 1)

        for (let n of this.getNeighbors(v, true)) {
          if (d + 1 > distance
            || this.get(n) === -sign
            || visited.some(w => vertexEquals(n, w))) continue

          visited.push(n)
          queue.push([n, d + 1])
        }
      }
    }

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        let v = [x, y]
        if (this.get(v) !== sign || done.some(w => vertexEquals(v, w))) continue

        let chain = this.getChain(v)
        chain.forEach(w => done.push(w))

        castInfluence(chain, 6)
      }
    }

    return map
  }

  getScore(areaMap) {
    let score = {
      area: [0, 0],
      territory: [0, 0],
      captures: this.captures
    }

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        let sign = areaMap[y][x]
        if (sign === 0) continue

        let index = sign > 0 ? 0 : 1

        score.area[index]++
        if (this.get([x, y]) === 0) score.territory[index]++
      }
    }

    return score
  }

  vertex2coord(vertex) {
    if (!this.hasVertex(vertex)) return null
    return alpha[vertex[0]] + (this.height - vertex[1])
  }

  coord2vertex(coord) {
    let x = alpha.indexOf(coord[0].toUpperCase())
    let y = this.height - +coord.substr(1)
    return [x, y]
  }

  isValid() {
    let liberties = {}

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        let vertex = [x, y]
        if (this.get(vertex) === 0 || vertex in liberties) continue
        if (!this.hasLiberties(vertex)) return false

        this.getChain(vertex).forEach(v => liberties[v] = true)
      }
    }

    return true
  }

  makeMove(sign, vertex) {
    let move = this.clone()

    if (sign === 0 || !this.hasVertex(vertex)) return move

    sign = sign > 0 ? 1 : -1
    move.set(vertex, sign)

    // Remove captured stones

    let deadNeighbors = move.getNeighbors(vertex)
      .filter(n => move.get(n) === -sign && !move.hasLiberties(n))

    for (let n of deadNeighbors) {
      if (move.get(n) === 0) continue

      for (let c of move.getChain(n)) {
        move.set(c, 0)
        move.captures[(-sign + 1) / 2]++
      }
    }

    move.set(vertex, sign)

    // Detect suicide

    if (deadNeighbors.length === 0 && !move.hasLiberties(vertex)) {
      for (let c of move.getChain(vertex)) {
        move.set(c, 0)
        move.captures[(sign + 1) / 2]++
      }
    }

    return move
  }

  getHandicapPlacement(count) {
    if (Math.min(this.width, this.height) < 6 || count < 2) return []

    let nearX = this.width >= 13 ? 3 : 2
    let nearY = this.height >= 13 ? 3 : 2
    let farX = this.width - nearX - 1
    let farY = this.height - nearY - 1

    let result = [[nearX, farY], [farX, nearY], [nearX, nearY], [farX, farY]]
    let middleX = (this.width - 1) / 2
    let middleY = (this.height - 1) / 2

    if (this.width % 2 !== 0 && this.height % 2 !== 0) {
      if (count === 5) result.push([middleX, middleY])
      result.push([nearX, middleY], [farX, middleY])

      if (count === 7) result.push([middleX, middleY])
      result.push([middleX, nearY], [middleX, farY], [middleX, middleY])
    } else if (this.width % 2 !== 0) {
      result.push([middleX, nearY], [middleX, farY])
    } else if (this.height % 2 !== 0) {
      result.push([nearX, middleY], [farX, middleY])
    }

    return result.slice(0, count)
  }

  generateAscii() {
    let result = []
    let lb = helper.linebreak

    let getIndexFromVertex = ([x, y]) => {
      let rowLength = 4 + this.width * 2
      return rowLength + rowLength * y + 1 + x * 2 + 1
    }

    // Make empty board

    result.push('+')
    for (let x = 0; x < this.width; x++) result.push('-', '-')
    result.push('-', '+', lb)

    for (let y = 0; y < this.height; y++) {
      result.push('|')
      for (let x = 0; x < this.width; x++) result.push(' ', '.')
      result.push(' ', '|', lb)
    }

    result.push('+')
    for (let x = 0; x < this.width; x++) result.push('-', '-')
    result.push('-', '+', lb)

    this.getHandicapPlacement(9).forEach(v => result[getIndexFromVertex(v)] = ',')

    // Place markers & stones

    let data = {
      plain: ['O', null, 'X'],
      circle: ['W', 'C', 'B'],
      square: ['@', 'S', '#'],
      triangle: ['Q', 'T', 'Y'],
      cross: ['P', 'M', 'Z'],
      label: null
    }

    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        let v = [x, y]
        let i = getIndexFromVertex(v)
        let s = this.get(v)

        if (!this.markups[v] || !(this.markups[v][0] in data)) {
          if (s !== 0) result[i] = data.plain[s + 1]
        } else {
          let [type, label] = this.markups[v]

          if (type !== 'label') {
            result[i] = data[type][s + 1]
          } else if (s === 0 && label.length === 1 && isNaN(parseFloat(label))) {
            result[i] = label.toLowerCase()
          }
        }
      }
    }

    result = result.join('')

    // Add lines & arrows

    for (let [start, end, arrow] of this.lines) {
      result += `{${arrow ? 'AR' : 'LN'} ${this.vertex2coord(start)} ${this.vertex2coord(end)}}${lb}`
    }

    return (lb + result.trim()).split(lb).map(l => `$$ ${l}`).join(lb)
  }

  getPositionHash() {
    return helper.hash(JSON.stringify(this.arrangement))
  }

  getHash() {
    return helper.hash(JSON.stringify([
      this.getPositionHash(),
      this.captures,
      this.markups,
      this.ghosts,
      this.lines
    ]))
  }
}

module.exports.Board = Board;

// ---------------
// Boardmatcher.js
// ---------------

// Hard-coding the shapes instead of reading from an SGF file
const _shapes = JSON.parse('[{"name":"Low Chinese Opening","anchors":[[10,2,1],[3,3,1],[16,3,1]],"vertices":[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[11,2,0],[12,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[2,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[15,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[3,3,1],[10,2,1],[16,3,1]],"size":"19","type":"corner"},{"name":"High Chinese Opening","anchors":[[3,3,1],[10,3,1],[16,3,1]],"vertices":[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[2,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[15,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[3,3,1],[10,3,1],[16,3,1]],"size":"19","type":"corner"},{"name":"Orthodox Opening","anchors":[[15,2,1],[3,3,1],[16,4,1]],"vertices":[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[13,2,0],[14,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[2,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[15,3,0],[16,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[17,4,0],[18,4,0],[0,5,0],[1,5,0],[2,5,0],[3,5,0],[4,5,0],[5,5,0],[6,5,0],[7,5,0],[8,5,0],[9,5,0],[10,5,0],[11,5,0],[12,5,0],[13,5,0],[14,5,0],[15,5,0],[16,5,0],[17,5,0],[18,5,0],[3,3,1],[15,2,1],[16,4,1]],"size":"19","type":"corner"},{"name":"Orthodox Opening","anchors":[[15,2,1],[2,3,1],[16,4,1]],"vertices":[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[13,2,0],[14,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[3,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[15,3,0],[16,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[17,4,0],[18,4,0],[0,5,0],[1,5,0],[2,5,0],[3,5,0],[4,5,0],[5,5,0],[6,5,0],[7,5,0],[8,5,0],[9,5,0],[10,5,0],[11,5,0],[12,5,0],[13,5,0],[14,5,0],[15,5,0],[16,5,0],[17,5,0],[18,5,0],[2,3,1],[15,2,1],[16,4,1]],"size":"19","type":"corner"},{"name":"Kobayashi Opening","anchors":[[3,2,1],[13,2,1],[9,3,1],[15,3,-1]],"vertices":[[15,3,-1],[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[2,3,0],[3,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[3,2,1],[13,2,1],[9,3,1]],"size":"19","type":"corner"},{"name":"Small Chinese Opening","anchors":[[8,2,1],[13,2,1],[2,3,1],[15,3,-1]],"vertices":[[15,3,-1],[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[3,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[2,3,1],[13,2,1],[8,2,1]],"size":"19","type":"corner"},{"name":"Micro Chinese Opening","anchors":[[7,2,1],[13,2,1],[2,3,1],[15,3,-1]],"vertices":[[15,3,-1],[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[3,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[2,3,1],[7,2,1],[13,2,1]],"size":"19","type":"corner"},{"name":"Sanrensei Opening","anchors":[[3,3,1],[9,3,1],[15,3,1]],"vertices":[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[2,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[15,3,1],[9,3,1],[3,3,1]],"size":"19","type":"corner"},{"name":"Nirensei Opening","anchors":[[3,3,1],[15,3,1]],"vertices":[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[3,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[2,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[3,3,1],[15,3,1]],"size":"19","type":"corner"},{"name":"Shūsaku Opening","anchors":[[3,2,-1],[14,2,-1],[16,3,1],[15,4,1],[16,14,-1],[2,15,1],[15,16,1]],"vertices":[[3,2,-1],[14,2,-1],[16,14,-1],[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0],[5,0,0],[6,0,0],[7,0,0],[8,0,0],[9,0,0],[10,0,0],[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[0,2,0],[1,2,0],[2,2,0],[4,2,0],[5,2,0],[6,2,0],[7,2,0],[8,2,0],[9,2,0],[10,2,0],[11,2,0],[12,2,0],[13,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[0,3,0],[1,3,0],[2,3,0],[3,3,0],[4,3,0],[5,3,0],[6,3,0],[7,3,0],[8,3,0],[9,3,0],[10,3,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[15,3,0],[17,3,0],[18,3,0],[0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[16,4,0],[17,4,0],[18,4,0],[0,5,0],[1,5,0],[2,5,0],[3,5,0],[4,5,0],[5,5,0],[6,5,0],[7,5,0],[8,5,0],[9,5,0],[10,5,0],[11,5,0],[12,5,0],[13,5,0],[14,5,0],[15,5,0],[16,5,0],[17,5,0],[18,5,0],[0,6,0],[1,6,0],[2,6,0],[3,6,0],[4,6,0],[5,6,0],[6,6,0],[7,6,0],[8,6,0],[9,6,0],[10,6,0],[11,6,0],[12,6,0],[13,6,0],[14,6,0],[15,6,0],[16,6,0],[17,6,0],[18,6,0],[0,7,0],[1,7,0],[2,7,0],[3,7,0],[4,7,0],[5,7,0],[6,7,0],[7,7,0],[8,7,0],[9,7,0],[10,7,0],[11,7,0],[12,7,0],[13,7,0],[14,7,0],[15,7,0],[16,7,0],[17,7,0],[18,7,0],[0,8,0],[1,8,0],[2,8,0],[3,8,0],[4,8,0],[5,8,0],[6,8,0],[7,8,0],[8,8,0],[9,8,0],[10,8,0],[11,8,0],[12,8,0],[13,8,0],[14,8,0],[15,8,0],[16,8,0],[17,8,0],[18,8,0],[0,9,0],[1,9,0],[2,9,0],[3,9,0],[4,9,0],[5,9,0],[6,9,0],[7,9,0],[8,9,0],[9,9,0],[10,9,0],[11,9,0],[12,9,0],[13,9,0],[14,9,0],[15,9,0],[16,9,0],[17,9,0],[18,9,0],[0,10,0],[1,10,0],[2,10,0],[3,10,0],[4,10,0],[5,10,0],[6,10,0],[7,10,0],[8,10,0],[9,10,0],[10,10,0],[11,10,0],[12,10,0],[13,10,0],[14,10,0],[15,10,0],[16,10,0],[17,10,0],[18,10,0],[0,11,0],[1,11,0],[2,11,0],[3,11,0],[4,11,0],[5,11,0],[6,11,0],[7,11,0],[8,11,0],[9,11,0],[10,11,0],[11,11,0],[12,11,0],[13,11,0],[14,11,0],[15,11,0],[16,11,0],[17,11,0],[18,11,0],[0,12,0],[1,12,0],[2,12,0],[3,12,0],[4,12,0],[5,12,0],[6,12,0],[7,12,0],[8,12,0],[9,12,0],[10,12,0],[11,12,0],[12,12,0],[13,12,0],[14,12,0],[15,12,0],[16,12,0],[17,12,0],[18,12,0],[0,13,0],[1,13,0],[2,13,0],[3,13,0],[4,13,0],[5,13,0],[6,13,0],[7,13,0],[8,13,0],[9,13,0],[10,13,0],[11,13,0],[12,13,0],[13,13,0],[14,13,0],[15,13,0],[16,13,0],[17,13,0],[18,13,0],[0,14,0],[1,14,0],[2,14,0],[3,14,0],[4,14,0],[5,14,0],[6,14,0],[7,14,0],[8,14,0],[9,14,0],[10,14,0],[11,14,0],[12,14,0],[13,14,0],[14,14,0],[15,14,0],[17,14,0],[18,14,0],[0,15,0],[1,15,0],[3,15,0],[4,15,0],[5,15,0],[6,15,0],[7,15,0],[8,15,0],[9,15,0],[10,15,0],[11,15,0],[12,15,0],[13,15,0],[14,15,0],[15,15,0],[16,15,0],[17,15,0],[18,15,0],[0,16,0],[1,16,0],[2,16,0],[3,16,0],[4,16,0],[5,16,0],[6,16,0],[7,16,0],[8,16,0],[9,16,0],[10,16,0],[11,16,0],[12,16,0],[13,16,0],[14,16,0],[16,16,0],[17,16,0],[18,16,0],[0,17,0],[1,17,0],[2,17,0],[3,17,0],[4,17,0],[5,17,0],[6,17,0],[7,17,0],[8,17,0],[9,17,0],[10,17,0],[11,17,0],[12,17,0],[13,17,0],[14,17,0],[15,17,0],[16,17,0],[17,17,0],[18,17,0],[0,18,0],[1,18,0],[2,18,0],[3,18,0],[4,18,0],[5,18,0],[6,18,0],[7,18,0],[8,18,0],[9,18,0],[10,18,0],[11,18,0],[12,18,0],[13,18,0],[14,18,0],[15,18,0],[16,18,0],[17,18,0],[18,18,0],[16,3,1],[15,16,1],[2,15,1],[15,4,1]],"size":"19","type":"corner"},{"name":"3-3 Point","anchors":[[16,2,1]],"vertices":[[16,0,0],[17,0,0],[18,0,0],[16,1,0],[17,1,0],[18,1,0],[17,2,0],[18,2,0],[16,2,1]],"type":"corner"},{"name":"Low Approach","anchors":[[14,2,1]],"vertices":[[16,3,-1],[13,0,0],[13,1,0],[13,2,0],[13,3,0],[13,4,0],[14,0,0],[14,1,0],[14,3,0],[14,4,0],[15,0,0],[15,1,0],[15,2,0],[15,3,0],[15,4,0],[16,0,0],[16,1,0],[16,2,0],[16,4,0],[17,0,0],[17,1,0],[17,2,0],[17,3,0],[17,4,0],[18,0,0],[18,1,0],[18,2,0],[18,3,0],[18,4,0],[14,2,1]],"type":"corner"},{"name":"Low Approach","anchors":[[13,2,1]],"vertices":[[15,3,-1],[12,0,0],[12,1,0],[12,2,0],[12,3,0],[12,4,0],[13,0,0],[13,1,0],[13,3,0],[13,4,0],[14,0,0],[14,1,0],[14,2,0],[14,3,0],[14,4,0],[15,0,0],[15,1,0],[15,2,0],[15,4,0],[16,0,0],[16,1,0],[16,2,0],[16,3,0],[16,4,0],[17,0,0],[17,1,0],[17,2,0],[17,3,0],[17,4,0],[18,0,0],[18,1,0],[18,2,0],[18,3,0],[18,4,0],[13,2,1]],"type":"corner"},{"name":"High Approach","anchors":[[14,3,1]],"vertices":[[16,3,-1],[13,0,0],[13,1,0],[13,2,0],[13,3,0],[13,4,0],[14,0,0],[14,1,0],[14,2,0],[14,4,0],[15,0,0],[15,1,0],[15,2,0],[15,3,0],[15,4,0],[16,0,0],[16,1,0],[16,2,0],[16,4,0],[17,0,0],[17,1,0],[17,2,0],[17,3,0],[17,4,0],[18,0,0],[18,1,0],[18,2,0],[18,3,0],[18,4,0],[14,3,1]],"type":"corner"},{"name":"High Approach","anchors":[[13,3,1]],"vertices":[[15,3,-1],[12,0,0],[12,1,0],[12,2,0],[12,3,0],[12,4,0],[13,0,0],[13,1,0],[13,2,0],[13,4,0],[14,0,0],[14,1,0],[14,2,0],[14,3,0],[14,4,0],[15,0,0],[15,1,0],[15,2,0],[15,4,0],[16,0,0],[16,1,0],[16,2,0],[16,3,0],[16,4,0],[17,0,0],[17,1,0],[17,2,0],[17,3,0],[17,4,0],[18,0,0],[18,1,0],[18,2,0],[18,3,0],[18,4,0],[13,3,1]],"type":"corner"},{"name":"Low Enclosure","anchors":[[14,2,1],[16,3,1]],"vertices":[[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[13,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[13,3,0],[14,3,0],[15,3,0],[17,3,0],[18,3,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[14,2,1],[16,3,1]],"type":"corner"},{"name":"Low Enclosure","anchors":[[13,2,1],[15,3,1]],"vertices":[[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[12,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[12,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[13,2,1],[15,3,1]],"type":"corner"},{"name":"High Enclosure","anchors":[[14,3,1],[16,3,1]],"vertices":[[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[13,3,0],[15,3,0],[17,3,0],[18,3,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[14,3,1],[16,3,1]],"type":"corner"},{"name":"High Enclosure","anchors":[[13,3,1],[15,3,1]],"vertices":[[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[12,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[12,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[13,3,1],[15,3,1]],"type":"corner"},{"name":"Low Enclosure","anchors":[[13,2,1],[16,3,1]],"vertices":[[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[12,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[12,3,0],[13,3,0],[14,3,0],[15,3,0],[17,3,0],[18,3,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[13,2,1],[16,3,1]],"type":"corner"},{"name":"Low Enclosure","anchors":[[12,2,1],[15,3,1]],"vertices":[[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[11,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[11,3,0],[12,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[12,2,1],[15,3,1]],"type":"corner"},{"name":"High Enclosure","anchors":[[13,3,1],[16,3,1]],"vertices":[[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[12,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[12,3,0],[14,3,0],[15,3,0],[17,3,0],[18,3,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[13,3,1],[16,3,1]],"type":"corner"},{"name":"High Enclosure","anchors":[[12,3,1],[15,3,1]],"vertices":[[11,0,0],[12,0,0],[13,0,0],[14,0,0],[15,0,0],[16,0,0],[17,0,0],[18,0,0],[11,1,0],[12,1,0],[13,1,0],[14,1,0],[15,1,0],[16,1,0],[17,1,0],[18,1,0],[11,2,0],[12,2,0],[13,2,0],[14,2,0],[15,2,0],[16,2,0],[17,2,0],[18,2,0],[11,3,0],[13,3,0],[14,3,0],[16,3,0],[17,3,0],[18,3,0],[11,4,0],[12,4,0],[13,4,0],[14,4,0],[15,4,0],[16,4,0],[17,4,0],[18,4,0],[12,3,1],[15,3,1]],"type":"corner"},{"name":"Mouth Shape","anchors":[[3,3,1],[5,3,1],[3,4,1],[4,5,1],[5,5,1]],"vertices":[[4,2,0],[4,3,0],[5,4,0],[6,4,0],[3,3,1],[3,4,1],[4,5,1],[5,5,1],[5,3,1]]},{"name":"Table Shape","anchors":[[3,3,1],[5,3,1],[3,4,1],[5,5,1]],"vertices":[[4,3,0],[4,4,0],[5,4,0],[6,4,0],[3,3,1],[3,4,1],[5,3,1],[5,5,1]]},{"name":"Tippy Table","anchors":[[5,6,1]],"vertices":[[3,4,0],[4,4,0],[4,5,0],[5,5,0],[3,3,1],[4,3,1],[3,5,1],[5,6,1]]},{"name":"Bamboo Joint","anchors":[[3,3,1],[4,3,1],[3,5,1],[4,5,1]],"vertices":[[3,4,0],[4,4,0],[3,3,1],[4,3,1],[3,5,1],[4,5,1]]},{"name":"Trapezium","anchors":[[5,3,1],[6,4,1]],"vertices":[[4,3,0],[6,3,0],[4,4,0],[5,4,0],[5,5,0],[3,3,1],[3,4,1],[5,3,1],[6,4,1]]},{"name":"Diamond","anchors":[[3,3,1],[2,4,1],[4,4,1],[3,5,1]],"vertices":[[3,4,0],[3,3,1],[2,4,1],[4,4,1],[3,5,1]]},{"name":"Tiger’s Mouth","anchors":[[3,3,1],[5,3,1],[4,4,1]],"vertices":[[4,2,0],[4,3,0],[3,3,1],[4,4,1],[5,3,1]]},{"name":"Empty Triangle","anchors":[[3,3,1],[4,3,1],[3,4,1]],"vertices":[[4,4,0],[3,3,1],[3,4,1],[4,3,1]]},{"name":"Turn","anchors":[[3,3,1],[4,4,1]],"vertices":[[3,4,-1],[3,3,1],[4,3,1],[4,4,1]]},{"name":"Extend","anchors":[[3,3,1],[3,4,1]],"vertices":[[3,3,1],[3,4,1]]},{"name":"Diagonal","anchors":[[3,3,1],[4,4,1]],"vertices":[[4,3,0],[3,4,0],[3,3,1],[4,4,1]]},{"name":"Wedge","anchors":[[3,3,1]],"vertices":[[4,3,-1],[2,3,-1],[3,2,0],[3,4,0],[3,3,1]]},{"name":"Hane","anchors":[[3,3,1],[4,4,1]],"vertices":[[4,3,-1],[3,4,0],[3,3,1],[4,4,1]]},{"name":"Cut","anchors":[[3,3,1],[4,4,1]],"vertices":[[4,3,-1],[3,4,-1],[3,3,1],[4,4,1]]},{"name":"Square","anchors":[[3,3,1],[5,3,1],[3,5,1],[5,5,1]],"vertices":[[4,4,0],[3,3,1],[5,3,1],[5,5,1],[3,5,1]]},{"name":"Parallelogram","anchors":[[3,3,1],[5,4,1],[3,5,1],[5,6,1]],"vertices":[[4,4,0],[4,5,0],[3,3,1],[5,4,1],[3,5,1],[5,6,1]]},{"name":"Dog’s Head","anchors":[[3,3,1],[5,4,1],[3,5,1]],"vertices":[[4,3,0],[3,4,0],[4,4,0],[4,5,0],[3,3,1],[3,5,1],[5,4,1]]},{"name":"Horse’s Head","anchors":[[3,3,1],[6,4,1],[3,5,1]],"vertices":[[4,3,0],[3,4,0],[4,4,0],[5,4,0],[4,5,0],[3,3,1],[3,5,1],[6,4,1]]},{"name":"Attachment","anchors":[[3,3,1]],"vertices":[[4,3,-1],[3,2,0],[4,2,0],[3,4,0],[4,4,0],[3,3,1]]},{"name":"One-point Jump","anchors":[[3,3,1],[5,3,1]],"vertices":[[4,3,0],[3,3,1],[5,3,1]]},{"name":"Big Bulge","anchors":[[3,3,1],[5,4,1],[4,6,1]],"vertices":[[4,4,0],[4,5,0],[3,3,1],[5,4,1],[4,6,1]]},{"name":"Small Knight","anchors":[[3,3,1],[5,4,1]],"vertices":[[4,3,0],[4,4,0],[3,3,1],[5,4,1]]},{"name":"Two-point Jump","anchors":[[3,3,1],[6,3,1]],"vertices":[[4,3,0],[5,3,0],[3,3,1],[6,3,1]]},{"name":"Large Knight","anchors":[[3,3,1],[6,4,1]],"vertices":[[4,3,0],[5,3,0],[4,4,0],[5,4,0],[3,3,1],[6,4,1]]},{"name":"Shoulder Hit","anchors":[[3,3,1]],"vertices":[[4,4,-1],[2,2,0],[3,2,0],[4,2,0],[2,3,0],[4,3,0],[2,4,0],[3,4,0],[3,3,1]]},{"name":"Diagonal Jump","anchors":[[3,3,1],[5,5,1]],"vertices":[[4,3,0],[3,4,0],[4,4,0],[5,4,0],[4,5,0],[3,3,1],[5,5,1]]}]');
let equals = v => w => w[0] === v[0] && w[1] === v[1]

// Imported from helpers.js
function vertexEquals([a, b], [c, d]) {
  return a === c && b === d
}

exports.getSymmetries = function([x, y]) {
  let f = ([x, y]) => [[x, y], [-x, y], [x, -y], [-x, -y]]
  return [...f([x, y]), ...f([y, x])]
}

exports.getBoardSymmetries = function(board, vertex) {
  let [mx, my] = [board.width - 1, board.height - 1]
  let mod = (x, m) => (x % m + m) % m

  return exports.getSymmetries(vertex).map(([x, y]) => [mod(x, mx), mod(y, my)])
}

exports.readShapes = function(content) {
  let tree = sgf.parse(content, () => {}, true)[0]
  let result = []

  for (let i = 0; i < tree.subtrees.length; i++) {
    let node = tree.subtrees[i].nodes[0]
    let anchors = node.MA.map(x => [...sgf.point2vertex(x), node.AB.includes(x) ? 1 : -1])
    let vertices = ['AW', 'CR', 'AB']
      .map((x, i) => (node[x] || []).map(y => [...sgf.point2vertex(y), i - 1]))
      .reduce((acc, x) => [...acc, ...x], [])

    let data = {}

    if ('C' in node) {
      for (let [key, value] of node.C[0].trim().split(', ').map(x => x.split(': '))) {
        data[key] = value
      }
    }

    result.push(Object.assign({
      name: node.N[0],
      anchors,
      vertices
    }, data))
  }

  return result
}

exports.cornerMatch = function(vertices, board) {
  let hypotheses = Array(8).fill(true)
  let hypothesesInvert = Array(8).fill(true)

  for (let [x, y, sign] of vertices) {
    let representatives = exports.getBoardSymmetries(board, [x, y])

    for (let i = 0; i < hypotheses.length; i++) {
      if (hypotheses[i] && board.get(representatives[i]) !== sign)
        hypotheses[i] = false
      if (hypothesesInvert[i] && board.get(representatives[i]) !== -sign)
        hypothesesInvert[i] = false
    }

    if (!hypotheses.includes(true) && !hypothesesInvert.includes(true))
      return null
  }

  let i = [...hypotheses, ...hypothesesInvert].indexOf(true)
  return i < 8 ? [i, false] : [i - 8, true]
}

exports.shapeMatch = function(shape, board, vertex) {
  if (!board.hasVertex(vertex)) return null

  let sign = board.get(vertex)
  if (sign === 0) return null
  let equalsVertex = equals(vertex)

  for (let anchor of shape.anchors) {
    let hypotheses = Array(8).fill(true)
    let i = 0

    if (shape.size != null && (board.width !== board.height || board.width !== +shape.size))
      continue

    if (shape.type === 'corner' && !exports.getBoardSymmetries(board, anchor.slice(0, 2)).some(equalsVertex))
      continue

    // Hypothesize vertex === anchor

    for (let [x, y, s] of shape.vertices) {
      let diff = [x - anchor[0], y - anchor[1]]
      let symm = exports.getSymmetries(diff)

      for (let k = 0; k < symm.length; k++) {
        if (!hypotheses[k]) continue
        let w = [vertex[0] + symm[k][0], vertex[1] + symm[k][1]]

        if (!board.hasVertex(w) || board.get(w) !== s * sign * anchor[2])
          hypotheses[k] = false
      }

      i = hypotheses.indexOf(true)
      if (i < 0) break
    }

    if (i >= 0) return [i, sign !== anchor[2]]
  }

  return null
}

exports.getMoveInterpretation = function(board, vertex, {shapes = null} = {}) {
  if (!board.hasVertex(vertex)) return 'Pass'

  let sign = board.get(vertex)
  let neighbors = board.getNeighbors(vertex)

  // Check atari

  if (neighbors.some(v => board.get(v) === -sign && board.getLiberties(v).length === 1))
    return 'Atari'

  // Check connection

  let friendly = neighbors.filter(v => board.get(v) === sign)
  if (friendly.length === neighbors.length) return 'Fill'
  if (friendly.length >= 2) return 'Connect'

  // Load shape library if needed

  if (shapes == null) {
    if (_shapes == null) {
      _shapes = readShapes(require('../../data/shapes.sgf'))
    }

    shapes = _shapes
  }

  // Match shape

  for (let shape of shapes) {
    if (exports.shapeMatch(shape, board, vertex))
      return shape.name
  }

  // Determine position to edges

  let equalsVertex = equals(vertex)

  if (equalsVertex([(board.width - 1) / 2, (board.height - 1) / 2]))
    return 'Tengen'

  let diff = board.getCanonicalVertex(vertex).map(x => x + 1)

  if (!equals(diff)([4, 4]) && board.getHandicapPlacement(9).some(equalsVertex))
    return 'Hoshi'

  if (diff[1] <= 6)
    return diff.join('-') + ' Point'

  return null
}
