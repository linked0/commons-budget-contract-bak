/* eslint-disable no-underscore-dangle */
import {NonceManager} from "@ethersproject/experimental";
import { expect } from "chai";
import crypto from "crypto";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, BigNumberish, BytesLike, Wallet } from "ethers";
import { ethers, network } from "hardhat";
import {
    CommonsBudget,
    CommonsBudget__factory as CommonsBudgetFactory,
    CommonsStorage,
    CommonsStorage__factory as CommonsStorageFactory,
    VoteraVote,
    VoteraVote__factory as VoteraVoteFactory,
} from "../typechain-types";
import {GasPriceManager} from "./GasPriceManager";

function toSystemInput(title: string, start: number, end: number, docHash: BytesLike) {
    return { start, end, startAssess: 0, endAssess: 0, docHash, amount: 0, title };
}

export async function displayBalance(address: string, addressName: string) {
    const proposerBalance = BigNumber.from(await ethers.provider.getBalance(address));
    const cent = BigNumber.from(10).pow(18);
    console.log(addressName, "balance: ", proposerBalance.div(cent).toString(), ".", proposerBalance.mod(cent).toString());
}

export async function getSigners(): Promise<NonceManager[]> {
    const [admin, voteManager, user, manager, proposer] = await ethers.getSigners();
    const adminSigner = new NonceManager(new GasPriceManager(ethers.provider.getSigner(admin.address)));
    const voteManagerSigner = new NonceManager(new GasPriceManager(ethers.provider.getSigner(voteManager.address)));
    const userSigner = new NonceManager(new GasPriceManager(ethers.provider.getSigner(user.address)));
    const managerSigner = new NonceManager(new GasPriceManager(ethers.provider.getSigner(manager.address)));
    const proposerSigner = new NonceManager(new GasPriceManager(ethers.provider.getSigner(proposer.address)));
    return [adminSigner, voteManagerSigner, userSigner, managerSigner, proposerSigner];
}

export async function getValidators() {
    const [admin, voteManager, user, manager, proposer, ...vals] = await ethers.getSigners();
    return vals;
}

export function generateVoteData(positive: number, negative: number, blank: number)
    : [number[], BigNumber[]] {
    const voterCount = positive + negative + blank;

    // setup votes
    const choices: number[] = [];
    const nonces: BigNumber[] = [];

    // set positive votes
    for (let i = 0; i < positive; i += 1) {
        choices.push(1);
        nonces.push(i + 1);
    }

    // set negative votes
    for (let i = positive; i < positive + negative; i += 1) {
        choices.push(2);
        nonces.push(i + 1);
    }

    // set blank (= abstention) votes
    for (let i = positive + negative; i < voterCount; i += 1) {
        choices.push(0);
        nonces.push(i + 1);
    }

    return [choices, nonces];
}