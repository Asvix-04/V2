import { motion } from "framer-motion";

const pageVariants = {
    initial: {
        opacity: 0,
        scale: 0.98,
        y: 10, // Slight upward drift for "floating" feel
        filter: "blur(4px)" // Premium touch: starts slightly blurry
    },
    enter: {
        opacity: 1,
        scale: 1,
        y: 0,
        filter: "blur(0px)",
        transition: {
            duration: 0.4,
            ease: [0.25, 0.1, 0.25, 1], // iOS-like ease-out
            staggerChildren: 0.1
        }
    },
    exit: {
        opacity: 0,
        scale: 1.02, // Zooms in slightly towards viewer
        filter: "blur(4px)",
        transition: {
            duration: 0.3,
            ease: "easeIn"
        }
    }
};

export const PageTransition = ({ children, className }) => {
    return (
        <motion.div
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className={className} // Pass through classNames like 'h-full'
        >
            {children}
        </motion.div>
    );
};
