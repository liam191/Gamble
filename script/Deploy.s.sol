// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {UPchainCasino} from "../src/UPchainCasino.sol";

contract Deploy is Script {
    function run() external {
        // Croupier = deployer (same account)
        address croupier = vm.envAddress("CROUPIER");

        vm.startBroadcast();

        UPchainCasino casino = new UPchainCasino(croupier);
        console.log("Casino deployed at:", address(casino));
        console.log("Owner:", casino.owner());
        console.log("Croupier:", casino.croupier());

        // Whitelist all 17 participants
        address[] memory players = new address[](17);
        players[0]  = 0x00000000c5d8F359706ed3bd565648058f0aC703; // hoont
        players[1]  = 0x000000000a7D1Ca67bE532908980dB8d0799c84D; // whatda
        players[2]  = 0x000000004B85e11A5dE92d561950f1f27932Ffab; // liam
        players[3]  = 0x00000000a3e87C5eb9E81f58F027d21f1a95e4f1; // errkat
        players[4]  = 0x00000000E1aC8b82227EdBde81D33ea79523aDBa; // wiker
        players[5]  = 0x000000007d4e94162EC046C56416a2a08A1e5e96; // fizz
        players[6]  = 0x00000000C393BDD02A6E3400f33fC8076b6b8c1f; // flowizy
        players[7]  = 0x000000000e1c6832cDe21b251972386B746c6e67; // akali
        players[8]  = 0x00000000a58997Bb0c286287697DFa7aF30638C1; // conan
        players[9]  = 0x000000002165b7757dCE6Ce9F357a575E24298cB; // lia
        players[10] = 0x0000000000cECAC7e1d08164Baba666955A68B90; // dandi
        players[11] = 0x0000000092a524304D2F2Aab7614a0A988E081B0; // link
        players[12] = 0x0000000000F75dff2C6446c9e85926889b1c31a5; // bomb
        players[13] = 0x00000000Be2F0d12699748e9372Fd56Ed434C4EC; // promael
        players[14] = 0x00000000FAdBF371089F5D8685Ef1881cfA9F33F; // archi
        players[15] = 0x0000000099F8cA7050fDE5B43A0c63f1f8aBa9C9; // jyoo
        players[16] = 0x00000000ab55b3cE61E9280F406b3A608AE89d4f; // viv4ld
        casino.addToWhitelist(players);
        console.log("Whitelisted 17 players");

        vm.stopBroadcast();
    }
}
