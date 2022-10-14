/* eslint-disable no-await-in-loop */
import chai, { expect } from "chai";
import crypto from "crypto";
import { solidity } from "ethereum-waffle";
import { BigNumber, BigNumberish, BytesLike, Wallet } from "ethers";
import { ethers, network, waffle } from "hardhat";
import * as assert from "assert";
import {
    IssuedContract,
    IssuedContract__factory as IssuedContractFactory,
    CommonsBudget,
    CommonsBudget__factory as CommonsBudgetFactory,
} from "../typechain-types";

chai.use(solidity);

describe("Test of Issued Contract", () => {
    let issuedContract: IssuedContract;
    let commonsBudget: CommonsBudget;

    const { provider } = waffle;
    const [admin, user] = provider.getWallets();

    // set 1 million BOA for CommonsBudget contract
    const commonsFund = BigNumber.from(10).pow(18).mul(1000000);
    const adminSigner = provider.getSigner(admin.address);
    const userSigner = provider.getSigner(user.address);

    before(async () => {
        const issuedContractFactory = await ethers.getContractFactory("IssuedContract");
        issuedContract = await issuedContractFactory.connect(admin).deploy();
        await issuedContract.deployed();

        const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        commonsBudget = await commonsBudgetFactory.connect(admin).deploy();
        await commonsBudget.deployed();
    });

    beforeEach(() => {});

    it("Set the CommonsBudget address", async () => {
        await expect(issuedContract.setCommonsBudgetAddress(commonsBudget.address))
            .to.emit(issuedContract, "CommonsBudgetAddressSet")
            .withArgs(commonsBudget.address);

        expect(await issuedContract.getCommonsBudgetAddress()).equal(commonsBudget.address);
    });

    it("Set the CommonsBudget address with EOA", async () => {
        await expect(issuedContract.setCommonsBudgetAddress(user.address)).to.be.revertedWith("NotContract");
    });

    it("Get/Set owner", async () => {
        expect(await issuedContract.getOwner()).equal(admin.address);

        // setOwner by a user and get reverted
        expect(await issuedContract.getOwner()).equal(admin.address);
        await expect(issuedContract.connect(userSigner).setOwner(ethers.constants.AddressZero)).to.be.revertedWith(
            "NotAuthorized"
        );

        // setOwner with zero address by a admin
        await issuedContract.setOwner(ethers.constants.AddressZero);
        expect(await issuedContract.getOwner()).equal(ethers.constants.AddressZero);

        // no one can call the setOwner due to the owner being zero address
        await expect(issuedContract.setOwner(user.address)).to.be.revertedWith("NotAuthorized");
    });
});
