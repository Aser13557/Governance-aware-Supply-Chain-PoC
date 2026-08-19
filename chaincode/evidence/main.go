package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&EvidenceContract{})
	if err != nil {
		log.Panicf("error creating evidence chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("error starting evidence chaincode: %v", err)
	}
}
