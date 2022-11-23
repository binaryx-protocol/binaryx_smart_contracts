import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre, {ethers, web3} from "hardhat";
import {expectBn} from "../../testUtils/testUtils";
import {onlyFields} from "../../testUtils/objectUtils";
import {AssetInput, AssetStatuses} from "../../testUtils/types";
import {defaultAssetAttrs} from "../../testUtils/fixtures";


const createMany = async (sc, count, attrs: Partial<AssetInput> = {}) => {
  for (let i =0; i<count;i++) {
    const a = { ...defaultAssetAttrs(), ...attrs }
    await sc.createAsset(...Object.values(a))
  }
}

const usdtDecimals = 1e6;
const usdtInitialBalance = 1000;
const ONE_YEAR_IN_SECS = 31536000;

describe("AssetsManager", function () {
  const expectUsdtBalance = async (usdtfToken, address, dollars) => expectBn(
    await usdtfToken.balanceOf(address)
  ).to.eq(dollars * usdtDecimals)

  async function deployFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

    const UsdtfToken = await ethers.getContractFactory("UsdtfToken");
    const usdtfToken = await UsdtfToken.deploy(web3.utils.toBN(usdtInitialBalance).mul(web3.utils.toBN(usdtDecimals)).toString());

    const Class = await ethers.getContractFactory("AssetsManager");
    const sc = await Class.deploy(usdtfToken.address);

    return { sc, owner, otherAccount, usdtfToken };
  }

  describe("Deployment", function () {
    it("should deploy", async function () {
      const { sc } = await loadFixture(deployFixture);

      const count = await sc.getAssetsCount()
      expectBn(count).to.eq(0)
    });
  });

  describe("createAsset", function () {
    it("with valid params", async function () {
      const { sc, otherAccount } = await loadFixture(deployFixture);

      await createMany(sc, 1)

      const count = await sc.getAssetsCount()
    });
    it("should mint tokens for the smart contract address", async function () {
      const { sc, otherAccount } = await loadFixture(deployFixture);

      await createMany(sc, 1)
      const balance = await sc.balanceOf(sc.address, 1)
      expectBn(balance).to.eq(10_000)
    });
  });

  describe("listAssets", function () {
    it("multiple items", async function () {
      const { sc, otherAccount } = await loadFixture(deployFixture);
      await createMany(sc, 10)

      const [resources] = await sc.listAssets()
      expect(resources.length).to.eq(10)
      expect(resources[0].symbol).to.eq("SYM")
    });
  });

  describe("investUsingUsdt", function () {
    it("with valid params", async function () {
      const { sc, otherAccount, owner, usdtfToken } = await loadFixture(deployFixture);
      await createMany(sc, 1)

      const assetId = 1;

      await expectUsdtBalance(usdtfToken, owner.address, usdtInitialBalance)
      await expectUsdtBalance(usdtfToken, sc.address, 0)

      expectBn(
        (await sc.balanceOf(owner.address, assetId))
      ).to.eq(0)

      // do the action
      await usdtfToken.approve(sc.address, 110 * usdtDecimals)
      await sc.investUsingUsdt(assetId, 2)

      // test swap was done
      await expectUsdtBalance(usdtfToken, owner.address, usdtInitialBalance - 100)
      await expectUsdtBalance(usdtfToken, sc.address, 100)
    });
  });

  describe("assetsIdsByInvestor", function () {
    it("should show multiple assets", async function () {
      const { sc, otherAccount, owner, usdtfToken } = await loadFixture(deployFixture);
      await createMany(sc, 5)
      await usdtfToken.approve(sc.address, 1000 * usdtDecimals)
      await sc.investUsingUsdt(1, 1)
      await sc.investUsingUsdt(3, 5)

      // test
      // const assetsIdsByInvestor = await sc.assetsIdsByInvestor()
      // expect(
      //   (assetsIdsByInvestor).length
      // ).to.eq(2)
      // expect(
      //   bnToInt(assetsIdsByInvestor[0])
      // ).to.eq(1)
      // expect(
      //   bnToInt(assetsIdsByInvestor[1])
      // ).to.eq(3)
      // test 2
      // const assetsByInvestor = await sc.assetsByInvestor()
      // expect(
      //   (assetsByInvestor).length
      // ).to.eq(2)
    });
  });

  describe("getMyRewardsPerAsset", function () {
    it("should calculate", async function () {
      const { sc, otherAccount, owner, usdtfToken } = await loadFixture(deployFixture);
      await createMany(sc, 5)
      await usdtfToken.approve(sc.address, 1000 * usdtDecimals)
      await sc.investUsingUsdt(1, 1)
      await sc.investUsingUsdt(3, 1)
      await sc.investUsingUsdt(3, 4)

      let myRewardsPerAsset = await sc.getMyRewardsPerAsset();

      expectBn(
        myRewardsPerAsset[0][0].balance
      ).to.eq(1)

      expectBn(
        myRewardsPerAsset[0][1].balance
      ).to.eq(5)

      expectBn(
        myRewardsPerAsset[0][0].rewardAmountDe6
      ).to.eq(0)

      expectBn(
        myRewardsPerAsset[0][1].rewardAmountDe6
      ).to.eq(0)

      await time.increaseTo((await time.latest()) + ONE_YEAR_IN_SECS);
      myRewardsPerAsset = await sc.getMyRewardsPerAsset();

      expectBn(
        myRewardsPerAsset[0][0].rewardAmountDe6
      ).to.eq(5 * usdtDecimals)

      expectBn(
        myRewardsPerAsset[0][1].rewardAmountDe6
      ).to.eq(25 * usdtDecimals)

      expect(
        myRewardsPerAsset[0].length
      ).to.eq(2)
    });
    it.only("should show only mine assets", async function () {
      const { sc, otherAccount, owner, usdtfToken } = await loadFixture(deployFixture);
      await createMany(sc, 5)

      await usdtfToken.approve(sc.address, 100 * usdtDecimals)
      await sc.investUsingUsdt(1, 1)

      await usdtfToken.transfer(otherAccount.address, 100 * usdtDecimals)
      await usdtfToken.connect(otherAccount).approve(sc.address, 100 * usdtDecimals)
      await sc.connect(otherAccount).investUsingUsdt(2, 1)

      let myRewardsPerAsset = await sc.getMyRewardsPerAsset();
      console.log('myRewardsPerAsset', myRewardsPerAsset)
    });
  });

  // describe("updateAsset", function () {
  //   it("one with valid params", async function () {
  //     const { sc, otherAccount } = await loadFixture(deployFixture);
  //     await createMany(sc, 1)
  //
  //     const resources = await sc.listAssets()
  //     const id = 0
  //     const resource = onlyFields<AssetInput>(resources[id])
  //     expect(resource.symbol).to.eq("SYM")
  //
  //     const attrs = {
  //       ...resource,
  //       symbol: 'UPD'
  //     }
  //     // attrs.propertyAddress.country = 'NW'
  //     // attrs.propertyAddress.city = 'NW'
  //     // delete attrs.propertyAddress
  //     await sc.updateAsset(
  //       id,
  //       ...Object.values(attrs),
  //     )
  //
  //     const resources2 = await sc.listAssets()
  //     const resource2 = resources2[id]
  //     expect(resource2.symbol).to.eq("UPD")
  //   });
  // });

  describe("setStatus", function () {
    it("from initial to active", async function () {
      const { sc, otherAccount } = await loadFixture(deployFixture);
      await createMany(sc, 1)

      const [resources] = await sc.listAssets()
      const id = 1
      const resource = onlyFields<AssetInput>(resources[0])
      expect(resource.status).to.eq(AssetStatuses.upcoming)

      await sc.setStatus(
        id,
        AssetStatuses.active,
      )

      const [resources2] = await sc.listAssets()
      const resource2 = resources2[0]
      expect(resource2.status).to.eq(AssetStatuses.active)
    });
  });

  describe("getAsset", function () {
    it("if exists", async function () {
      const { sc, otherAccount } = await loadFixture(deployFixture);
      await createMany(sc, 1)

      const resource = await sc.getAsset(1)
      expect(resource).to.exist
    });
    it("if not found", async function () {
      const { sc, otherAccount } = await loadFixture(deployFixture);
      await createMany(sc, 1)

      expect(async () => await sc.getAsset(1000000)).to.throw
    });
  });

  describe("claimRewardsInUsdt", function () {
    it("should withdraw and give USDT", async function () {
      const { sc, owner, otherAccount, usdtfToken } = await loadFixture(deployFixture);
      await createMany(sc, 1)
      await usdtfToken.transfer(sc.address, 5 * usdtDecimals)
      await usdtfToken.approve(sc.address, 50 * usdtDecimals)
      await sc.investUsingUsdt(1, 1)

      // 5.00 is accumulated by this time
      await time.increaseTo((await time.latest()) + ONE_YEAR_IN_SECS);
      await expectUsdtBalance(usdtfToken, owner.address, usdtInitialBalance - 55)

      await sc.claimRewardsInUsdt() // BOOM

      await expectUsdtBalance(usdtfToken, owner.address, usdtInitialBalance - 50)

      // const myRewardsPerAsset = await sc.getMyRewardsPerAsset();
      // expectBn(
      //   myRewardsPerAsset.totalClaimedDe6
      // ).to.eq(5 * usdtDecimals)
    });
  });
});
