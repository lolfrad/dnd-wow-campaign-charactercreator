module.exports = {
    roots: [`<rootDir>/tests`],
    testEnvironment: `jest-environment-jsdom`,
    testMatch: [`**/tests/**/*.test.[jt]s?(x)`],
    transform: {
        "^.+\\.js$": `babel-jest`
    }
}
