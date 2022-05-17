import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { ethers, waffle } from "hardhat";
import { CommonsBudgetContract } from "../typechain";

import * as assert from "assert";

chai.use(solidity);

describe("Test of Commons Budget Contract", () => {
    let contract: CommonsBudgetContract;

    const provider = waffle.provider;
    const [admin] = provider.getWallets();
    const amount = BigNumber.from(10).pow(18);

    before(async () => {
        const CommonsBudgetContractFactory = await ethers.getContractFactory("CommonsBudgetContract");
        contract = await CommonsBudgetContractFactory.deploy() as CommonsBudgetContract;
        await contract.deployed();
    });

    it("Send", async () => {
         await provider.getSigner(admin.address).sendTransaction({
             to: contract.address,
             value: amount,
         });
    });

    it("Check", async () => {
        const balance = await provider.getBalance(contract.address);
        assert.deepStrictEqual(balance, amount);
    });
});
