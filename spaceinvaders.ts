import { fromEvent, interval, merge, scheduled, range, Subscription, zip } from 'rxjs';
import { map, filter, scan, concatMap, takeUntil, mergeMap, take, concatAll, takeWhile, repeatWhen, isEmpty } from 'rxjs/operators';

function spaceinvaders() {
  



  // constant values
  const constants = {
    CANVAS_SIZE: 600
  } as const

  // Types
  type Key = 'Space' | 'Enter';
  type Event = 'keydown' | 'keyup' | 'mousemove' | 'click'
  type GameStatus = "Won" | "Lost" | "Ingame"


  // type PowerUp = Readonly<{ id: string, createTime: number }>
  type ObjectId = Readonly<{ id: string, createTime: number }>
  type MovableObj = Readonly<{
    vel: Vec,
    angle: number,
    rotation: number,
    torque: number
  }>
  type Obj = Readonly<{ pos: Vec, radius: number }>
  interface MovableBody extends StaticBody, MovableObj { }
  interface StaticBody extends ObjectId, Obj { }
  interface PowerUp extends ObjectId { }

  type Body = Readonly<MovableBody>
  // type State has generic type to allow type safe and abstract and reusable
  type State<T> = Readonly<{
    time: number,
    ship: T,
    shipBullets: ReadonlyArray<T>,
    alienBullets: ReadonlyArray<T>,
    aliens: ReadonlyArray<T>,
    exit: ReadonlyArray<T>,
    bulletCount: number,
    score: number,
    gameStatus: GameStatus,
    level: number,
    shields: ReadonlyArray<T>,
    powerUp: PowerUp,
    availablePowerUp: PowerUp,
  


  }>



  // types of actions
  class Tick { constructor(public readonly elapsed: number, public readonly randomValue: number) { } }
  class Move { constructor(public readonly direction: number) { } }
  class Shoot { constructor() { } }
  class Restart { constructor() { } }
  class UsePower { constructor() { } }

  // function to create obersavble for mouse movement
  //has generics to allow parametric ppolymorphism and ensure type is used consistenly
  const mouseObservable = <T>(e: Event, result: (v?: { x: number, y: number }) => T) => {
    const mouseMove = fromEvent<MouseEvent>(document.getElementById("canvas"), e)
    return mouseMove.pipe(map(result))
  }

  // function to create observable for keyboard (for spacebar)
  //has generics to allow parametric ppolymorphism and ensure type is used consistenly
  const keyObservable = <T>(e: Event, k: Key, result: () => T) =>
    fromEvent<KeyboardEvent>(document, e).pipe(
      filter(({ code }) => code === k),
      filter(({ repeat }) => !repeat),
      map(result)
    )
  // observable stream of random numbers created to allow randomness in game
  const randomNumberStream$ = (seed: number) => interval(10).pipe(scan((r, _) => r.next(), new RNG(seed)), map(r => r.float()))
  // observable stream for ticks with random numbers
  //used zip to pair the values from the 2 stream
  const gameClock$ = zip(interval(10), randomNumberStream$(21)).pipe(map(([elapsed, randomValue]) => new Tick(elapsed, randomValue)))
  //observable stream for key press(spacebar) for shooting
  const shoot$ = keyObservable('keydown', 'Space', () => new Shoot()),
    //observable stream for mouse mouse for moving ship
    movement$ = mouseObservable("mousemove", (({ x, y }) => new Move(x)))
  //observable stream for mouse click for restarting
  const restart$ = keyObservable('keydown', 'Enter', () => new Restart())
  //observable stream for mouse click for restarting
  const usePower$ = mouseObservable('click', () => new UsePower())

  //function to create ship body
  function createShip(): Body {
    return {
      id: 'ship',
      pos: new Vec(constants.CANVAS_SIZE / 2, 550),
      vel: Vec.Zero,
      angle: 0,
      rotation: 0,
      torque: 0,
      radius: 20,
      createTime: 0
    }
  }
  //function to create ship bullet body
  function createShipBullet(s: State<Body>): Body {
    return {
      id: `ShipBullet${s.bulletCount}`,
      pos: s.ship.pos.add(new Vec(0, -1).scale(s.ship.radius)),
      vel: new Vec(0, -1.75),
      createTime: s.time,
      angle: 0,
      rotation: 0,
      torque: 0,
      radius: 2.5
    }
  }
  //function to create Alien bullet body
  //made curried to allow partial application
  function createAlienBullet<T>(s: State<T>): (b: Body) => Body {
    return b => makeAlienBullet(b)
    
    function makeAlienBullet(b: Body): Body {

      return <Body>{
        id: `AlienBullet${s.time}`,
        pos: new Vec(b.pos.x, b.pos.y).add(new Vec(0, 1).scale(b.radius)),
        vel: new Vec(0, 2),
        createTime: s.time,

        angle: 0,
        rotation: 0,
        torque: 0,
        radius: 2.5
      }
    }


  }
  //function to create Alien  body
  //made curried to allow partial application
  function createAlien(pos: { x: number, y: number }): (count: number) => Body {
    return (count) => {
      return {
        id: `alien${count}`,
        pos: new Vec(pos.x, pos.y),
        vel: new Vec(0.55, 0),
        angle: 0,
        rotation: 0,
        torque: 0,
        radius: 20,
        createTime: 0
      }
    }
  }
  //function to create Power Up
  // made curried to allow partial application
  function createPowerUp(powerid: string): (createdTime: number) => PowerUp {
    return createdTime => <PowerUp>{ id: powerid, createTime: createdTime }
  }

  //function to create shield body
  //made curried to allow partial application
  function createShield(pos: { x: number, y: number }): (count: number) => StaticBody {
    return (count) => {
      return {
        id: `shield${count}`,
        pos: new Vec(pos.x, pos.y),
        radius: 20,
        createTime: 0
      }
    }
  }
  //creates ReadonlyArray of n size
  const arraymaker = (n: number): ReadonlyArray<Body> => <ReadonlyArray<Body>>[...Array(n)]

  // make aliens
  function makeAliens(): ReadonlyArray<Body> {
    const rowAliens = (yVal: number) => (count: number) => arraymaker(10).map((_, i) => i).map(value => createAlien({ x: (value + 10) + value * 40, y: yVal })(value + count))
    const columnAliens: Readonly<Body>[][] = arraymaker(5).map((_, i) => i).map(y => rowAliens(y * 35 + 20)(y * 10))
    return [].concat.apply([], columnAliens)
  }



  //make shields
  function makeShields(): ReadonlyArray<Body> {
    const rowShields = (multiply: number) => (yVal: number) => (count: number) => [...Array(10)].map((_, i) => i).map(value => createShield({ x: (value + 15 * (5 * (3 * (multiply)))) + value * 8, y: yVal })(value + count))
    const columnShields = (multiply: number) => arraymaker(5).map((_, i) => i).map(y => rowShields(multiply)(y * 8 + 440)(y * 10 + 50 * (multiply)))
    const multiplyShield: Readonly<Body>[][] = arraymaker(3).map((_, i) => i).map(y => [].concat.apply([], columnShields(y)))
    return [].concat.apply([], multiplyShield)
  }

  //the initialm state
  const initialState: State<Body> = {
    time: 0,
    ship: createShip(),
    shipBullets: [],
    alienBullets: [],
    aliens: makeAliens(),
    exit: [],
    bulletCount: 0,
    score: 0,
    gameStatus: "Ingame",
    level: 1,
    shields: makeShields(),
    powerUp: createPowerUp("none")(0),
    availablePowerUp: createPowerUp("freeze")(0),
  

  }

  //handle collisions
  const handleCollisions = (s: State<Body>) => {

    //utility for collision

    // collision checker
    const bodiesCollided = ([a, b]: [Body, Body]) =>
      a.pos.sub(b.pos).len() < a.radius + b.radius

    // function to filter different kind of collision of 2 array Body
    // made curried to allow partial application and reusability
    function filterCollision<T>(initial: ReadonlyArray<T>): (target: ReadonlyArray<T>) => ReadonlyArray<T> {
      return (target) => {
        const combinedBodies = [].concat(flatMap(initial, initial => target.map(target => [initial, target])))
        const collidedBodies = combinedBodies.filter(bodiesCollided)
        return collidedBodies.map(([_, target]) => target)
      }
    }


    // function to compare other bodies to shipBullets
    const collidingShipBullets = filterCollision(s.shipBullets)
    // function to compare other bodies to alienBullets
    const collidingAlienBullets = filterCollision(s.alienBullets)
    // function to compare other bodies to shields
    const collidingShields = filterCollision(s.shields)

    //bodies collided with shipBullets
    const collidedShipBullets: ReadonlyArray<Body> = [].concat(collidingShields(s.shipBullets),
      filterCollision(s.aliens)(s.shipBullets))

    //bodies collided with alienBullets
    const collidedAlienBullets: ReadonlyArray<Body> = [].concat(collidingShields(s.alienBullets),
      s.alienBullets.filter(r => bodiesCollided([s.ship, r])))

    // bodies collided with shields
    const collidedShields: ReadonlyArray<Body> = [].concat(
      collidingShipBullets(s.shields),
      collidingAlienBullets(s.shields)
    )
    // bodies collided with aliens
    const collidedAliens: ReadonlyArray<Body> = [].concat(collidingShipBullets(s.aliens))

    //function to check if ship collided
    const shipCollided: boolean =
      s.aliens.filter(r => bodiesCollided([s.ship, r])).length > 0 ||
      s.alienBullets.filter(r => bodiesCollided([s.ship, r])).length > 0
    const cut = except((a: Body) => (b: Body) => a.id === b.id);

    //function to calculate score
    const calcScore = (): number => s.score + collidedAliens.length * 20

    //function to control game status
    const controlGameStatus = (): GameStatus => s.powerUp.id != "immortality" && shipCollided ? "Lost" : "Ingame"

    // function to increment velocity of a body,made it a curried function
    // to allow it to do partial application
    function incrementVelocity(speed: number): (b: Body) => Body {
      return b => {
        return <Body>{ ...b, vel: b.vel.scale(speed) }
      }
    }
    //control alien speed if theres a collided aliens, increment it speed
    //else dont increment it
    // made curried to allow partial applicaton
    function controlAlienSpeed(length: number): (b: Body) => Body {
      const increment = incrementVelocity(1.05)
      const remain = incrementVelocity(1)
      return b => length > 0 ? increment(b) : remain(b)
    }

    return <State<Body>>{
      ...s,
      shipBullets: cut(s.shipBullets)(collidedShipBullets),
      aliens: cut(s.aliens)(collidedAliens).map(controlAlienSpeed(collidedAliens.length)),
      exit: s.exit.concat(collidedShields, collidedAliens, collidedAlienBullets, collidedShipBullets),
      score: calcScore(),
      gameStatus: controlGameStatus(),
      shields: cut(s.shields)(collidedShields),
      alienBullets: cut(s.alienBullets)(collidedAlienBullets),

    };
  }





// allows our game to have sense of time
  const tick = (s: State<Body>, elapsed: number, randomValue: number): State<Body> => {
    //moves body
    const moveBody = (b: Body): Body => <Body>{
      ...b,
      rotation: b.rotation + b.torque,
      angle: b.angle + b.rotation,
      pos: b.pos.add(b.vel),
      vel: b.vel.add(Vec.Zero)
    }

    //stops movement of body
    const stopBody = (b: Body): Body => <Body>{
      ...b,
      pos: b.pos.add(Vec.Zero)
    }

    // function to filter different kind of bullets
    // made curried to allow partial application and reusability
    //has generics to allow type consistency
    function filterBullets<T>(bodies: ReadonlyArray<T>): (f: (b: T) => boolean) => T[] {
      return f => bodies.filter(f)
    }

    const filterShipBullets = filterBullets(s.shipBullets)
    const filterAlienBullets = filterBullets(s.alienBullets)

    //function to calculate PowerUp or Body expiry
    //  made curried to allow partial application
    //uses generic and etended ObjectID since ObjectId has property of
    //createTime and want it to be abstract to be allow it to be
    //reused
    const expired = <F extends ObjectId>(limit: number) => (a: F) => {
      return elapsed - a.createTime > limit

    }

    const
      bodyExpired = expired(550),
      expiredShipBullets: Body[] = filterShipBullets(bodyExpired),
      activeShipBullets = filterShipBullets(not(bodyExpired)),
      expiredAlienBullets: Body[] = filterAlienBullets(bodyExpired),
      activeAlienBullets = filterAlienBullets(not(bodyExpired));

    // allow bodies to bounce to the other side and descend 
    const bounceWrap = (s: State<Body>): State<Body> => {
      //allows body to turn to other direction
      const turn = (b: MovableObj): Body => <Body>{ ...b, vel: b.vel.rotate(180) }

      return s.aliens.filter(a => a.pos.x < 0 || a.pos.x + 15 > constants.CANVAS_SIZE).length > 0 ?
        <State<Body>>{
          ...s,
          aliens: s.aliens.map(descendDown).map(turn)
        } :
        <State<Body>>{ ...s }
    }
    //function to help body to descend
    const descendDown = (b: Body): Body => {
      return {
        ...b,
        pos: b.pos.add(new Vec(0, 10))
      }
    }

    // check if user had won
    //generic used to ensure type consistency
    function isWon<T>(s: State<T>): State<T> {
      return s.level === 30 &&
        s.aliens.length === 0 &&
        s.gameStatus === "Ingame" ?
        <State<T>>{ ...s, gameStatus: "Won" } :
        <State<T>>{ ...s }
    }




    // function to allow user to move on to next level
    //made curried to allow partial application
    function nextLevel(s: State<Body>): State<Body> {

      return s.aliens.length == 0 && s.alienBullets.length == 0 && s.gameStatus == "Ingame" ? <State<Body>>{
        ...s,
        level: s.level + 1,
        shields: makeShields(),
        aliens: makeAliens(),
        availablePowerUp: createRandomPowerUp()
      } :
        { ...s }

    }

    // allow random fire and adjusts the fire rate for aliens
    //made higher order function and curried to allow partial application
    function setRandomFire(setFireRate: (n: number) => boolean): (s: State<Body>) => State<Body> {
      return s => {
        const bul=createAlienBullet(s)
        //creates a random index of an alien
        const getRandomAlienIndex=()=>Number((randomValue * (s.aliens.length-1)).toFixed(0))
     
        const newAlienBullets= s.aliens.length!=0? s.alienBullets.concat(bul(s.aliens[getRandomAlienIndex()])): s.alienBullets.concat([])
       
        return{
          ...s,
          //speed increases, as level increases
          alienBullets: setFireRate(s.level - 1.5) ? newAlienBullets : s.alienBullets,
        }
      
      }

    }

    //controls alien firing speed,made it higher order function
    // to ble able to decide what kind of function to return
    function controlBulletFireRate(): (increment?: number) => boolean {
      const adjustFireRate = (increment: number) => delay(30 - increment)
      const noFire = () => false
      return s.powerUp.id == "freeze" ? noFire : adjustFireRate
    }

    // to make a delayer
    const delay = (val: number): boolean => s.time % val == 0

    //Curried function that clears (emptying) the state.
    //Made curried to allow partial application  
    //generic used to ensure type consistency
    function clear<T>(s: State<T>): (gameMode: GameStatus) => State<T> {
      return (gameMode) => {
        return {
          ...s,
          shipBullets: [],
          alienBullets: [],
          aliens: [],
          exit: [].concat(s.exit, s.aliens, s.shields, s.shipBullets, s.alienBullets),
          bulletCount: 0,
          shields: [],
          gameStatus: gameMode,
          powerUp: createPowerUp("none")(0),
          time: 0,
          availablePowerUp: createPowerUp("none")(0)
        }
      }
    }

    // function to decides if game should continue or not
    // curried function to allow partial application
    //generic used to ensure type consistency
    function decider<T>(latest: State<T>): (origin: State<T>) => State<T> {
      return (origin) => {
        const gameStatus = origin.gameStatus
        return gameStatus == "Ingame" ? latest : clear(origin)(gameStatus)
      }
    }

    //gain a random power up: immortality or freeze
    function createRandomPowerUp(): PowerUp {
      const position = Number((randomValue * 1).toFixed(0))
      return position == 1 ? createPowerUp('freeze')(s.time)
        : createPowerUp("immortality")(s.time)

    }

    //remove power when it expires
    //generic used to ensure type consistency
    const removePower = <T>(s: State<T>): State<T> => {
      const powerExpired = expired(500)
      return powerExpired(s.powerUp) ? { ...s, powerUp: createPowerUp("none")(0) } :
        { ...s }
    }

   

    // a composite function that composes handlers and is also curried
    //helps to combine multiple functions together to operate on the State
    //it is curried to allow partial application
    //generic used to ensure type consistency
    function composeHandlers(...fns: ((x: State<Body>) => State<Body>)[] ): (s: State<Body>) => State<Body> {
     
      return s => fns.reduce((acc, curr) => curr(acc), s)
    }
    // function to random Fire based on the control of bullet speed
    //usage of partial application of setRandomFire
    const randomFire = setRandomFire(controlBulletFireRate())



    // a combined handlers function for State
    // a usage of partial applicstion of composeHandlers function
    const combinedHandlers =
      composeHandlers(handleCollisions,
        isWon, bounceWrap, nextLevel, randomFire, removePower)

    //controls the movement of bodies
    // It is made to be a higher order function to help
    //decide what function to return for the movement of Body
    function controlMovement(): (b: Body) => Body {
      return s.powerUp.id == "freeze" ? stopBody : moveBody
    }

    const someState = <State<Body>>{
      ...s,
      shipBullets: activeShipBullets.map(moveBody),
      alienBullets: activeAlienBullets.map(controlMovement()),
      exit: expiredShipBullets.concat(expiredAlienBullets),
      aliens: s.aliens.map(controlMovement()),
      time: elapsed,

    }


    return decider(combinedHandlers(someState))(s)
  }


  //manipulate state
  //generic used to ensure type consistency
  const
    reduceState = <T>(s: State<Body>, e: T) =>
      e instanceof Move ? {
        ...s,
        ship: { ...s.ship, pos: new Vec(e.direction, s.ship.pos.y) }
      } :
        e instanceof Shoot ? {
          ...s,
          shipBullets: s.shipBullets.concat([createShipBullet(s)]),
          bulletCount: s.bulletCount + 1
          

        } : e instanceof Tick ? tick(s, e.elapsed, e.randomValue) :
          e instanceof UsePower && s.availablePowerUp.id != "none" ? {
            ...s,
            powerUp: createPowerUp(s.availablePowerUp.id)(s.time),
            availablePowerUp: <PowerUp>{ id: "none", createTime: 0 }
          }
            : e instanceof Restart && s.gameStatus != "Ingame" ? initialState
              : { ...s }

  const subscription = merge(
    gameClock$, movement$, shoot$, restart$, usePower$).pipe(
      scan(reduceState, initialState))
    .subscribe(updateView);


  // this is the only function that is impure and contains Impure function
  //function to update view
  function updateView(s: State<Body>) {
    const
      ship = document.getElementById("ship")!,
      svg = document.getElementById("canvas")

    ship.setAttribute('transform', `translate(${s.ship.pos.x},${s.ship.pos.y})`);

    // function to help set attribute onto an Element object
    //made curried to allow partial application
    //impure function
    function attr<T>(ele: Element): (t: T) => void {
      return t => {
        const c: string[] = zip(Object.keys(t), Object.values(t))
        c.forEach((v) => ele.setAttribute(v[0], v[1]))
      }
    }
    // A function to zip 2 arrays
    // pure function
    function zip<T, U>(a: T[], b: T[]): U[] {
      return [].concat(a.map((e, i) => [e, b[i]]))
    }
    // function to create Body view
    // made curried to allow partial application
    function createBodyView(shape: string): (b: Body) => Element {
      return b => {
        const createView = () => {
          const v = document.createElementNS("http://www.w3.org/2000/svg", shape)!;
          attr(v)({ "id": b.id })
          svg.appendChild(v)
          return v;
        }
        return document.getElementById(b.id) || createView();
      }
    }
    //function to create ellpise views
    const createEllipseView = createBodyView("ellipse")

    // function to create rect views
    const createRectView = createBodyView("rect")

    // ship bullet
    s.shipBullets.forEach(b => attr(createEllipseView(b))({
      "cx": String(b.pos.x),
      "cy": String(b.pos.y),
      "rx": "5",
      "ry": "5",
      "fill": "cyan"
    }))

    //alien bullet
    s.alienBullets.forEach(b => attr(createEllipseView(b))({
      "cx": String(b.pos.x),
      "cy": String(b.pos.y),
      "rx": "5",
      "ry": "5",
      "fill": "orange",
    }))


    //Alien 
    s.aliens.forEach(b => attr(createRectView(b))({
      "x": String(b.pos.x),
      "y": String(b.pos.y),
      "width": "15",
      "height": "15",
      "fill": "red",
      "stroke": "white",
      "stroke-width": "1",
      "opacity": "1",
      "display": "inline-block",
      "marginLeft": "10px"
    }))


    //Shield view
    s.shields.forEach(b => attr(createRectView(b))({
      "x": String(b.pos.x),
      "y": String(b.pos.y),
      "width": "10",
      "height": "10",
      "fill": "yellow"
    }))


    s.exit.forEach(o => {
      const v = document.getElementById(o.id);
      if (v) svg.removeChild(v)
    })
    //text to display when won or lost 
    const text = document.getElementById("theText")
    attr(text)({
      "font-size": "5em",
      "x": String(constants.CANVAS_SIZE / 6),
      "y": String(constants.CANVAS_SIZE / 6)
    })

    //function to show game Lost
    const getLost = (text: HTMLElement) => {
      text.textContent = "GAME OVER"
      attr(text)({ "fill": "red" })

    }
    // function to show game won
    const getWon = (text: HTMLElement) => {
      attr(text)({ "fill": "green" })
      text.textContent = "VICTORY"

    }
    //function to make default text
    const getDefault = (text: HTMLElement) => {
      text.textContent = ""
    }
    //produces gameStatus result
    s.gameStatus == "Lost" ?
      getLost(text) :
      s.gameStatus == "Won" ?
        getWon(text) : getDefault(text)

    //power up text
    const power = document.getElementById("thePowerUp")
    power.textContent = s.availablePowerUp.id

    //power up expired text
    const expiredTimer = document.getElementById("theExpired")
    s.powerUp.id != "none" ? expiredTimer.textContent = "" + (5 - (s.time - s.powerUp.createTime) / 100).toFixed(0)
      : expiredTimer.textContent = ""
    // score text
    const score = document.getElementById("theScore")
    score.textContent = "" + s.score

    //level text
    const level = document.getElementById("theLevel")
    level.textContent = "" + s.level



  }
}


// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = () => {
    spaceinvaders();


  }



//Utility functions
// code below got it from FIT2102 notes
class Vec {
  constructor(public readonly x: number = 0, public readonly y: number = 0) { }
  add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y)
  sub = (b: Vec) => this.add(b.scale(-1))
  len = () => Math.sqrt(this.x * this.x + this.y * this.y)
  scale = (s: number) => new Vec(this.x * s, this.y * s)
  ortho = () => new Vec(this.y, -this.x)
  rotate = (deg: number) =>
    (rad => (
      (cos, sin, { x, y }) => new Vec(x * cos - y * sin, x * sin + y * cos)
    )(Math.cos(rad), Math.sin(rad), this)
    )(Math.PI * deg / 180)

  static unitVecInDirection = (deg: number) => new Vec(0, -1).rotate(deg)
  static Zero = new Vec();
}
function flatMap<T, U>(
  a: ReadonlyArray<T>,
  f: (a: T) => ReadonlyArray<U>
): ReadonlyArray<U> {
  return Array.prototype.concat(...a.map(f));
}

const /**
   * Composable not: invert boolean result of given function
   * @param f a function returning boolean
   * @param x the value that will be tested with f
   */
  not = <T>(f: (x: T) => boolean) => (x: T) => !f(x),
  /**
   * is e an element of a using the eq function to test equality?
   * @param eq equality test function for two Ts
   * @param a an array that will be searched
   * @param e an element to search a for
   */
  elem = <T>(eq: (_: T) => (_: T) => boolean) => (a: ReadonlyArray<T>) => (
    e: T
  ) => a.findIndex(eq(e)) >= 0,
  /**
   * array a except anything in b
   * @param eq equality test function for two Ts
   * @param a array to be filtered
   * @param b array of elements to be filtered out of a
   */

  except = <T>(eq: (_: T) => (_: T) => boolean) => (a: ReadonlyArray<T>) => (
    b: ReadonlyArray<T>
  ) => a.filter(not(elem(eq)(b)))

class RNG {
  // LCG using GCC's constants
  readonly m = 0x80000000// 2**31
  readonly a = 1103515245
  readonly c = 12345
  state: number
  constructor(readonly seed: number) {

    this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
  }
  int() {
    return (this.a * this.state + this.c) % this.m;

  }
  float() {
    return this.int() / (this.m - 1);
  }
  next() {
    return new RNG(this.int())
  }
}

