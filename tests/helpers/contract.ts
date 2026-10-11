import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
export const contract = JSON.parse(
  readFileSync("contracts/openapi.yaml", "utf8"),
);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const defs = JSON.parse(
  JSON.stringify(contract.components.schemas).replaceAll(
    "#/components/schemas/",
    "#/$defs/",
  ),
);
export function validator(name: string) {
  return ajv.compile({ $defs: defs, $ref: "#/$defs/" + name });
}
export function operationValidator(
  route: string,
  method: string,
  status: string,
) {
  const schema =
    contract.paths[route][method].responses[status].content["application/json"]
      .schema;
  return ajv.compile({
    $defs: defs,
    ...JSON.parse(
      JSON.stringify(schema).replaceAll("#/components/schemas/", "#/$defs/"),
    ),
  });
}
