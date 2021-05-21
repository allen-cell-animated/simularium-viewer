import { compareFloats } from "../util";

describe("util", () => {
    describe("compareFloats", () => {
        const PRECISION_REF = 0.1;

        test("it correctly determines number1 > number2", () => {
            const result = compareFloats(
                14.699999809265137,
                14.6,
                PRECISION_REF
            );
            expect(result).toEqual(1);
        });

        test("it correctly determines number1 < number2", () => {
            const result = compareFloats(
                14.600000381469727,
                14.699999809265137,
                PRECISION_REF
            );
            expect(result).toEqual(-1);
        });

        test("it correctly determines number1 ~= number2 when number1 is slightly greater", () => {
            const result = compareFloats(
                14.700000190734863,
                14.699999809265137,
                PRECISION_REF
            );
            expect(result).toEqual(0);
        });

        test("it correctly determines number1 ~= number2 when number1 is slightly less", () => {
            const result = compareFloats(
                14.699999809265137,
                14.7,
                PRECISION_REF
            );
            expect(result).toEqual(0);
        });

        test("it correctly determines number1 ~= number2 when numbers are equal", () => {
            const result = compareFloats(0.005, 0.005, 0.005);
            expect(result).toEqual(0);
        });
    });
});