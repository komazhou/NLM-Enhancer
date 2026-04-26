console.log("Testing regex replacement:");
const test = (s) => {
    const raw = s.trim().replace(/^\$\$?|\$\$?$/g, '');
    console.log(`'${s}' -> '${raw}'`);
};
test("$$x$$");
test("$x$");
test("$$ x $$");
test("\\[ x \\]");
test("x");
