// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { CommonsBudgetContract } from "../typechain";

import { Wallet } from "ethers";
import { ethers } from "hardhat";

async function main() {
    const ContractFactory = await ethers.getContractFactory("CommonsBudgetContract");

    const provider_ethnet = ethers.provider;
    const admin = new Wallet(process.env.ADMIN_KEY || "");
    const adminSigner = provider_ethnet.getSigner(admin.address);
    const contract = (await ContractFactory.connect(adminSigner).deploy()) as CommonsBudgetContract;
    await contract.deployed();

    console.log("deployed to:", contract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
