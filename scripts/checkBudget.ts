// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import chai, { assert, expect } from "chai";
import fs from "fs";
import { join } from "path";
import { GasPriceManager } from "../utils/GasPriceManager";

import { BigNumber, Wallet } from "ethers";
import { ethers } from "hardhat";

import { NonceManager } from "@ethersproject/experimental";

async function main() {
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const AgoraDAOFactory = await ethers.getContractFactory("AgoraDAO");

    const provider = ethers.provider;
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const agoraDAO = await AgoraDAOFactory.attach(process.env.DAO_CONTRACT || "");

    const cent = BigNumber.from(10).pow(18);
    const commonsBalance = BigNumber.from(await ethers.provider.getBalance(commonsBudget.address));
    const daoBalance = BigNumber.from(await ethers.provider.getBalance(agoraDAO.address));
    console.log("========== Balance: {BOA} . {CENT} ==========");

    // CommonsBudget balance
    console.log(
        "CommonsBudget (",
        commonsBudget.address,
        ") :",
        commonsBalance.div(cent).toString(),
        ".",
        commonsBalance.mod(cent).toString()
    );

    // DAO balance
    console.log(
        "AgoraDAO (",
        agoraDAO.address,
        ") :",
        daoBalance.div(cent).toString(),
        ".",
        daoBalance.mod(cent).toString()
    );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});