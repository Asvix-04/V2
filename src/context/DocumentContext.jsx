import * as React from "react";

const DocumentContext = React.createContext({
    documents: [],
    addDocument: () => { },
    removeDocument: () => { },
});

export const useDocuments = () => React.useContext(DocumentContext);

export function DocumentProvider({ children }) {
    // Initialize from localStorage or empty array
    const [documents, setDocuments] = React.useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("asvix_documents");
            return saved ? JSON.parse(saved) : [];
        }
        return [];
    });

    // Persist to localStorage whenever documents change
    React.useEffect(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem("asvix_documents", JSON.stringify(documents));
        }
    }, [documents]);

    const addDocument = (files) => {
        const newDocs = files.map(file => ({
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: file.type,
            date: new Date().toISOString(),
        }));
        setDocuments(prev => [...newDocs, ...prev]);
    };

    const removeDocument = (id) => {
        setDocuments(prev => prev.filter(doc => doc.id !== id));
    };

    return (
        <DocumentContext.Provider value={{ documents, addDocument, removeDocument }}>
            {children}
        </DocumentContext.Provider>
    );
}
