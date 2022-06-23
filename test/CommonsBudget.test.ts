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
    const admin_signer = provider.getSigner(admin.address);

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

    it("Check Proposal Fee", async () => {
        const fundProposalFee = await contract.getFundProposalFeePermil();
        assert.deepStrictEqual(fundProposalFee.toString(), "10");
        const systemProposalFe = await contract.getSystemProposalFee();
        assert.deepStrictEqual(systemProposalFe.toString(), "100000000000000000000");
    });

    it("Set Proposal Fee", async () => {
        await contract.connect(admin_signer).setFundProposalFeePermil(20);
        await contract.connect(admin_signer).setSystemProposalFee(BigNumber.from(500).mul(BigNumber.from(10).pow(18)));

        const fundProposalFee = await contract.getFundProposalFeePermil();
        assert.deepStrictEqual(fundProposalFee.toString(), "20");
        const systemProposalFe = await contract.getSystemProposalFee();
        assert.deepStrictEqual(systemProposalFe.toString(), "500000000000000000000");
    });

    it("Check Quorum Factor", async () => {
        const factor = await contract.getVoteQuorumFactor();
        assert.deepStrictEqual(factor, 333333);
    });

    it("Set Quorum Factor", async () => {
        await contract.connect(admin_signer).setVoteQuorumFactor(200000);
        const factor = await contract.getVoteQuorumFactor();
        assert.deepStrictEqual(factor, 200000);
    });
});
