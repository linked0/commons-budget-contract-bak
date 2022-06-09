import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { ethers, waffle } from "hardhat";
import { CommonsBudget } from "../typechain";

import * as assert from "assert";

chai.use(solidity);

describe("Test of Commons Budget Contract", () => {
    let contract: CommonsBudget;

    const provider = waffle.provider;
    const [admin] = provider.getWallets();
    const amount = BigNumber.from(10).pow(18);

    before(async () => {
        const CommonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        contract = (await CommonsBudgetFactory.deploy()) as CommonsBudget;
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
