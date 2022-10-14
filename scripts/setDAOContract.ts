import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { GasPriceManager } from "../utils/GasPriceManager";

async function main() {
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const AgoraDAOFactory = await ethers.getContractFactory("AgoraDAO");

    const provider = ethers.provider;

    const admin = new Wallet(process.env.ADMIN_KEY || "");
    const adminSigner = new NonceManager(new GasPriceManager(provider.getSigner(admin.address)));
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    
    const agoraDAO = await AgoraDAOFactory.attach(process.env.DAO_CONTRACT || "");

    await commonsBudget.connect(adminSigner).setDAOContract(agoraDAO.address);
    console.log("setDAOContract - DAO address:", agoraDAO.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});