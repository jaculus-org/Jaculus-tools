import * as winston from "winston";
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.cli()),
            stderrLevels: ["error", "warn", "info", "verbose", "debug", "silly"]
        }),
        // new winston.transports.File({
        //     format: winston.format.combine(
        //         winston.format.timestamp(),
        //         winston.format.json()
        //     ),
        //     filename: "jac.log",
        //     level: "verbose"
        // })
    ]
});
logger.verbose("Log level: " + process.env.LOG_LEVEL);
//# sourceMappingURL=logger.js.map