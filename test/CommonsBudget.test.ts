/* eslint-disable no-await-in-loop */
import chai, { expect } from "chai";
import crypto from "crypto";
import { solidity } from "ethereum-waffle";
import { BigNumber, BigNumberish, BytesLike, Wallet } from "ethers";
import { ethers, network, waffle } from "hardhat";
import * as assert from "assert";
import {
    CommonsBudget,
    CommonsBudget__factory as CommonsBudgetFactory,
} from "../typechain-types";

chai.use(solidity);

describe("Test of Commons Budget Contract", () => {
    let contract: CommonsBudget;

    const assessCount = 2;
    const passAssessResult = [7, 7, 7, 7, 7];
    const rejectedAssessResult = [6, 6, 6, 6, 6];

    const { provider } = waffle;
    const [admin, user, ...validators] = provider.getWallets();
    // set 1 million BOA for CommonsBudget contract
    const commonsFund = BigNumber.from(10).pow(18).mul(1000000);
    const adminSigner = provider.getSigner(admin.address);

    before(async () => {
        const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        contract = await commonsBudgetFactory.connect(admin).deploy();
        await contract.deployed();
    });

    beforeEach(() => {
    });

    it("isOwner", async () => {
        expect(await contract.isOwner(admin.address)).equal(true);
        expect(await contract.isOwner(user.address)).equal(false);
    });
});
