import {
    initializeBlock,
    useBase,
    useTable,
    useRecordById,
    useRecordPicker,
    useGlobalConfig,
    Button,
    Box,
    Heading,
    Text,
    Select,
    Loader,
    Markdown,
} from '@airtable/blocks/ui';
import React, {useState, useEffect, useCallback} from 'react';
import './style.css';

// --- 1. CONFIGURATION ---
// This is from your script
const CONFIG = {
    API_URL_BASE: "https://futuramic-nonglandulous-senaida.ngrok-free.dev",
    GENERATE_ENDPOINT: "/generate-outreach",
    TEMPLATES_ENDPOINT: "/templates",
    SUBJECT_LINE: "ReFED Catalytic Grant Fund: Minimizing Methane",
    TABLE_NAME: "Outreach" // We'll use this to get the table object
};

function OutreachApp() {
    // We use React's useState hook to manage the app's state
    const [templates, setTemplates] = useState(null);
    const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
    const [fetchTemplatesError, setFetchTemplatesError] = useState(null);
    
    // State for the selected record
    // We store the ID, and then use a hook to get the full record object
    const [selectedRecordId, setSelectedRecordId] = useState(null);

    // State for the selected template
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    
    // State for the generation process
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState(null);
    const [generatedDraft, setGeneratedDraft] = useState(null); // Will store {email_text, template_used, ...}

    // Airtable hooks to get base and table context
    const base = useBase();
    const table = useTable(CONFIG.TABLE_NAME);

    // This hook gets the full record object from its ID.
    // It will automatically update when selectedRecordId changes.
    const selectedRecord = useRecordById(table, selectedRecordId);

    // --- 2. FETCH AVAILABLE TEMPLATES ---
    // This function replaces the first block of your script.
    // We use useCallback to prevent it from being recreated on every render.
    const fetchTemplates = useCallback(async () => {
        setIsFetchingTemplates(true);
        setFetchTemplatesError(null);
        console.log('Attempting to fetch templates from:', CONFIG.API_URL_BASE + CONFIG.TEMPLATES_ENDPOINT);

        try {
            const templatesResponse = await fetch(CONFIG.API_URL_BASE + CONFIG.TEMPLATES_ENDPOINT, {
                method: 'GET',
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                }
            });

            console.log('Response status:', templatesResponse.status);

            if (!templatesResponse.ok) {
                const errorText = await templatesResponse.text();
                console.error('Response error text:', errorText);
                throw new Error(`HTTP error! status: ${templatesResponse.status}, message: ${errorText}`);
            }

            const templateData = await templatesResponse.json();
            console.log('Fetched templates:', templateData);
            
            if (!templateData || Object.keys(templateData).length === 0) {
                throw new Error("No email templates found. Please check the template folder.");
            }
            
            setTemplates(templateData);
        } catch (error) {
            console.error('Detailed fetch error:', error);
            setFetchTemplatesError(error.message);
        } finally {
            setIsFetchingTemplates(false);
        }
    }, []); // Empty dependency array means this function is created once

    // Use React's useEffect hook to call fetchTemplates when the app first loads
    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]); // Runs once on mount

    // --- 3. SELECT THE RECORD (ROW) ---
    // This replaces `input.recordAsync`
    // We use the useRecordPicker hook to launch a record selection modal
    const [isRecordPickerVisible, setIsRecordPickerVisible] = useState(false);
    const showRecordPicker = useRecordPicker(table, {
        onSelect: (record) => {
            setSelectedRecordId(record ? record.id : null);
            setGeneratedDraft(null); // Clear old draft if new record is picked
            setGenerationError(null);
        },
    });
    
    // --- 4. TEMPLATE SELECTION ---
    // This replaces `input.buttonsAsync`
    // We build options for a <Select> component from the fetched templates
    const templateOptions = templates ? Object.entries(templates).map(([id, description]) => ({
        value: id,
        label: `${id.replace(/_/g, ' ')} - ${description}`
    })) : [];

    // --- 5. GENERATE DRAFT LOGIC ---
    // This is the main function, triggered by our "Generate" button
    const generateDraft = async () => {
        if (!selectedRecord || !selectedTemplate) {
            setGenerationError("Please select a record and a template.");
            return;
        }

        setIsGenerating(true);
        setGenerationError(null);
        setGeneratedDraft(null);

        try {
            // --- 5. GET DATA FROM THE SELECTED RECORD ---
            // This logic is ported directly from your script
            const gdriveUrlRaw = selectedRecord.getCellValue("Google Drive Folder URL");
            const gdriveUrl = Array.isArray(gdriveUrlRaw) ? gdriveUrlRaw[0] : gdriveUrlRaw;

            const contactName = selectedRecord.getCellValue("Name");

            const companyNameRaw = selectedRecord.getCellValue("Organization");
            let companyName;
            if (Array.isArray(companyNameRaw)) {
                companyName = companyNameRaw[0]?.name || companyNameRaw[0];
            } else if (typeof companyNameRaw === 'object' && companyNameRaw !== null) {
                companyName = companyNameRaw.name;
            } else {
                companyName = companyNameRaw;
            }

            const contactEmail = selectedRecord.getCellValue("Email");
            const title = selectedRecord.getCellValue("Title") || "";
            const summary = selectedRecord.getCellValue("Summary") || "";
            const angle = selectedRecord.getCellValue("Angle for Outreach") || "";
            const note = selectedRecord.getCellValue("Note") || "";

            // --- 6. VALIDATE INPUTS ---
            if (!gdriveUrl) {
                throw new Error("Error: The 'Google Drive Folder URL' field is empty for this record.");
            }
            if (!companyName) {
                throw new Error("Error: The 'Organization' field is empty. Please add a company name.");
            }
            if (!contactName) {
                throw new Error("Error: The 'Name' field is empty. Please add a contact name.");
            }

            // --- 7. BUILD API PAYLOAD ---
            const payload = {
                airtable_context: {
                    name: String(companyName),
                    title: String(title),
                    summary: String(summary),
                    angle_for_outreach: String(angle),
                    note: String(note)
                },
                contact_name: String(contactName),
                google_drive_folder_url: String(gdriveUrl),
                template_type: selectedTemplate
            };

            console.log("Sending payload to API:", JSON.stringify(payload, null, 2));

            // --- 8. CALL THE API ENDPOINT ---
            const fullApiUrl = CONFIG.API_URL_BASE + CONFIG.GENERATE_ENDPOINT;
            const response = await fetch(fullApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify(payload),
            });
            
            console.log("Response status:", response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("API Error:", errorText);
                throw new Error(`API Error (Status ${response.status}): ${errorText || "The server returned an error."}`);
            }

            // --- 9. PARSE RESPONSE ---
            const data = await response.json();
            console.log("Response data:", data);
            
            if (!data || !data.email_text) {
                console.error("Invalid response:", data);
                throw new Error("Error: The API responded, but did not return an email draft.");
            }
            
            // --- 10. BUILD 'MAILTO:' LINK & SET STATE ---
            // We save the full response data, which includes the email draft
            const subject = encodeURIComponent(CONFIG.SUBJECT_LINE);
            const body = encodeURIComponent(data.email_text);
            const email = encodeURIComponent(contactEmail || '');
            const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;

            setGeneratedDraft({
                ...data,
                contactName,
                contactEmail,
                companyName,
                mailtoLink,
            });

        } catch (error) {
            console.error("Script Error:", error);
            setGenerationError(`Script Error: ${error.message}. Check the API URL and make sure your local server is running.`);
        } finally {
            setIsGenerating(false);
        }
    };
    
    // --- 11. DISPLAY THE UI ---
    // This is the React render() function. It replaces all `output.text` etc.
    // It re-renders automatically whenever state (e.g., `isGenerating`, `generatedDraft`) changes.

    if (isFetchingTemplates) {
        return (
            <Box padding={3}>
                <Loader />
                <Text textAlign="center">Fetching available email templates...</Text>
            </Box>
        );
    }

    if (fetchTemplatesError) {
        return (
            <Box padding={3}>
                <Heading>Error Fetching Templates</Heading>
                <Text textColor="red">{fetchTemplatesError}</Text>
                <Button onClick={fetchTemplates} icon="redo">Try Again</Button>
            </Box>
        );
    }
    
    return (
        <Box padding={3} >
            <Heading>Email Draft Generator</Heading>
            
            {/* Step 1: Record Picker */}
            <Box marginBottom={2}>
                <Heading size="small">1. Select Record</Heading>
                <Button
                    icon="user"
                    onClick={() => showRecordPicker()}
                >
                    {selectedRecord ? selectedRecord.name : "Select a record"}
                </Button>
                {selectedRecord && (
                    <Text marginLeft={2} textColor="light">
                        {selectedRecord.getCellValue("Organization") ? 
                         selectedRecord.getCellValue("Organization")[0].name : 
                         'No Organization'}
                    </Text>
                )}
            </Box>

            {/* Step 2: Template Picker */}
            <Box marginBottom={2}>
                <Heading size="small">2. Select Template</Heading>
                <Select
                    options={templateOptions}
                    value={selectedTemplate}
                    onChange={newValue => setSelectedTemplate(newValue)}
                    placeholder="Select a template..."
                    width="100%"
                />
            </Box>
            
            {/* Step 3: Generate Button */}
            <Box marginBottom={2}>
                 <Button
                    variant="primary"
                    icon="bolt"
                    onClick={generateDraft}
                    disabled={!selectedRecord || !selectedTemplate || isGenerating}
                >
                    {isGenerating ? "Generating..." : "Generate Draft"}
                </Button>
            </Box>

            {/* Step 4: Show Loader, Error, or Result */}
            <Box>
                {isGenerating && <Loader />}

                {generationError && (
                    <Box>
                        <Heading size="small" textColor="red">Generation Error</Heading>
                        <Text textColor="red">{generationError}</Text>
                    </Box>
                )}

                {generatedDraft && (
                    <Box>
                        <Heading>Draft Generated!</Heading>
                        <Text>
                            **To:** {generatedDraft.contactName} ({generatedDraft.contactEmail || 'No Email'})
                        </Text>
                        <Text>**Company:** {generatedDraft.companyName}</Text>
                        <Text>**Template:** {generatedDraft.template_used}</Text>
                        
                        <Button 
                            icon="envelope" 
                            href={generatedDraft.mailtoLink}
                            target="_blank"
                            variant="primary"
                            marginTop={2}
                            marginBottom={2}
                        >
                            Open in Email Client
                        </Button>

                        <Heading size="small" marginTop={2}>Generated Draft</Heading>
                        {/* Using <Markdown> is great, but <Text> inside a <Box> 
                          is safer for displaying large blocks of text to copy.
                        */}
                        <Box
                            border="thick"
                            backgroundColor="grayLight1"
                            padding={2}
                            borderRadius="large"
                            maxHeight="400px"
                            overflow="auto"
                        >
                            <Text whiteSpace="pre-wrap">{generatedDraft.email_text}</Text>
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

initializeBlock(() => <OutreachApp />);
