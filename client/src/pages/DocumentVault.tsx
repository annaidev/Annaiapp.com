import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Plane,
  Building2,
  Shield,
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Check,
  Edit3,
  X,
  Route,
  Car,
  WandSparkles,
} from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { useDocuments, useCreateDocument, useDeleteDocument } from "@/hooks/use-documents";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { api, buildUrl } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import type { TravelDocument } from "@shared/schema";

const DOC_TYPES = [
  { value: "flight", label: "Flight", icon: Plane, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { value: "hotel", label: "Hotel", icon: Building2, color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  { value: "insurance", label: "Insurance", icon: Shield, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "transport", label: "Transport", icon: Route, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { value: "rental_car", label: "Rental Car", icon: Car, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  { value: "other", label: "Other", icon: FileText, color: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
] as const;

type BookingImportPreview = {
  summary: string;
  warnings: string[];
  documents: Array<{
    docType: string;
    label: string;
    referenceNumber?: string | null;
    notes?: string | null;
  }>;
  budgetItems: Array<{
    category: string;
    description: string;
    amount: number;
    currency: string;
  }>;
};

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

function getDocTypeConfig(type: string) {
  return DOC_TYPES.find((d) => d.value === type) || DOC_TYPES[DOC_TYPES.length - 1];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="icon" variant="ghost" onClick={handleCopy} data-testid="button-copy-reference">
      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function DocumentVault() {
  const [, params] = useRoute("/trips/:id/documents");
  const tripId = parseInt(params?.id || "0", 10);
  const queryClient = useQueryClient();

  const { data: trip, isLoading: isLoadingTrip } = useTrip(tripId);
  const { data: documents, isLoading: isLoadingDocs } = useDocuments(tripId);
  const createMutation = useCreateDocument();
  const deleteMutation = useDeleteDocument();
  const { toast } = useToast();
  const { t } = useI18n();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formDocType, setFormDocType] = useState("flight");
  const [formLabel, setFormLabel] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAttachmentName, setFormAttachmentName] = useState("");
  const [formAttachmentDataUrl, setFormAttachmentDataUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<BookingImportPreview | null>(null);

  const previewImportMutation = useMutation({
    mutationFn: async (rawText: string) => {
      const url = buildUrl(api.bookingImport.preview.path, { tripId });
      const res = await apiRequest(api.bookingImport.preview.method, url, { rawText });
      return (await res.json()) as BookingImportPreview;
    },
    onSuccess: (preview) => {
      setImportPreview(preview);
    },
    onError: (error) => {
      toast({
        title: "Import preview failed",
        description: error instanceof Error ? error.message : "Unable to preview the booking import.",
        variant: "destructive",
      });
    },
  });

  const applyImportMutation = useMutation({
    mutationFn: async (preview: BookingImportPreview) => {
      const url = buildUrl(api.bookingImport.apply.path, { tripId });
      const res = await apiRequest(api.bookingImport.apply.method, url, preview);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.travelDocuments.listByTrip.path, tripId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "budget-items"] });
      setImportText("");
      setImportPreview(null);
      toast({ title: "Import saved", description: "Imported documents and budget items were added to this trip." });
    },
    onError: (error) => {
      toast({
        title: "Import save failed",
        description: error instanceof Error ? error.message : "Unable to save imported items.",
        variant: "destructive",
      });
    },
  });

  if (isLoadingTrip || isLoadingDocs) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!trip) {
    return <div className="min-h-screen flex items-center justify-center">Trip not found</div>;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formLabel.trim()) return;
    createMutation.mutate(
      {
        tripId,
        docType: formDocType,
        label: formLabel.trim(),
        referenceNumber: formReference.trim() || null,
        notes: formNotes.trim() || null,
        attachmentName: formAttachmentName || null,
        attachmentDataUrl: formAttachmentDataUrl || null,
      },
      {
        onSuccess: () => {
          setFormLabel("");
          setFormReference("");
          setFormNotes("");
          setFormAttachmentName("");
          setFormAttachmentDataUrl("");
          setFormDocType("flight");
          setIsFormOpen(false);
        },
      },
    );
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFormAttachmentName("");
      setFormAttachmentDataUrl("");
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({
        title: "File too large",
        description: "Please upload a document under 3 MB.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsDataURL(file);
      });

      setFormAttachmentName(file.name);
      setFormAttachmentDataUrl(dataUrl);
    } catch {
      toast({
        title: "Attachment failed",
        description: "Could not read the selected file.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id, tripId });
  };

  const docs = (documents as TravelDocument[]) || [];

  const groupedDocs = DOC_TYPES.reduce<Record<string, TravelDocument[]>>((acc, type) => {
    const filtered = docs.filter((doc) => doc.docType === type.value);
    if (filtered.length > 0) {
      acc[type.value] = filtered;
    }
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href={`/trips/${trip.id}`} className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("docs.back")}
        </Link>

        <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-secondary/10 rounded-2xl text-secondary">
                <FolderOpen className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground" data-testid="text-vault-title">{t("docs.title")}</h1>
                <p className="text-muted-foreground font-medium mt-1">for {trip.destination}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="secondary" data-testid="text-doc-count">
                {docs.length} {docs.length === 1 ? "document" : "documents"}
              </Badge>
              <Button onClick={() => setIsFormOpen(!isFormOpen)} className="rounded-xl" data-testid="button-add-document">
                {isFormOpen ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {isFormOpen ? t("docs.cancel") : t("docs.add")}
              </Button>
            </div>
          </div>

          <Card className="mb-8 rounded-3xl border border-primary/15 bg-primary/5 p-6 shadow-none">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <WandSparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">{t("docs.importTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("docs.importBody")}</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("docs.importInput")}</label>
                <Textarea
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  className="min-h-[180px] rounded-2xl bg-background"
                  placeholder="Paste the booking email or confirmation text here."
                  data-testid="textarea-import-booking"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => previewImportMutation.mutate(importText)}
                  disabled={previewImportMutation.isPending || importText.trim().length < 20}
                  className="rounded-2xl"
                  data-testid="button-preview-import"
                >
                  {previewImportMutation.isPending ? "Reviewing..." : t("docs.importPreview")}
                </Button>
                {importPreview && (
                  <Button
                    variant="outline"
                    onClick={() => applyImportMutation.mutate(importPreview)}
                    disabled={applyImportMutation.isPending}
                    className="rounded-2xl"
                    data-testid="button-apply-import"
                  >
                    {applyImportMutation.isPending ? "Saving..." : t("docs.importApply")}
                  </Button>
                )}
              </div>

              {importPreview && (
                <div className="rounded-2xl border border-border/60 bg-background p-5">
                  <h4 className="font-semibold text-foreground">{t("docs.importSummary")}</h4>
                  <p className="mt-2 text-sm text-muted-foreground">{importPreview.summary}</p>

                  {importPreview.warnings.length > 0 && (
                    <div className="mt-4">
                      <h5 className="mb-2 text-sm font-semibold text-foreground">{t("docs.importWarnings")}</h5>
                      <ul className="space-y-2">
                        {importPreview.warnings.map((warning, index) => (
                          <li key={`${warning}-${index}`} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <h5 className="mb-2 text-sm font-semibold text-foreground">Suggested documents</h5>
                      <div className="space-y-2">
                        {importPreview.documents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No document records detected.</p>
                        ) : (
                          importPreview.documents.map((doc, index) => (
                            <div key={`${doc.label}-${index}`} className="rounded-xl border border-border/50 px-3 py-3">
                              <p className="font-medium text-foreground">{doc.label}</p>
                              <p className="text-xs text-muted-foreground mt-1">{doc.docType}</p>
                              {doc.referenceNumber && <p className="text-xs text-muted-foreground mt-1">{doc.referenceNumber}</p>}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <h5 className="mb-2 text-sm font-semibold text-foreground">Suggested budget items</h5>
                      <div className="space-y-2">
                        {importPreview.budgetItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No budget items detected.</p>
                        ) : (
                          importPreview.budgetItems.map((item, index) => (
                            <div key={`${item.description}-${index}`} className="rounded-xl border border-border/50 px-3 py-3">
                              <p className="font-medium text-foreground">{item.description}</p>
                              <p className="text-xs text-muted-foreground mt-1">{item.category}</p>
                              <p className="text-xs text-muted-foreground mt-1">{formatCurrency(item.amount, item.currency)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {isFormOpen && (
            <form onSubmit={handleSubmit} className="mb-8 bg-muted/30 rounded-2xl p-6 border border-border/50" data-testid="form-add-document">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Edit3 className="h-5 w-5" /> {t("docs.new")}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("docs.type")}</label>
                  <div className="flex flex-wrap gap-2">
                    {DOC_TYPES.map((type) => {
                      const Icon = type.icon;
                      const isSelected = formDocType === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setFormDocType(type.value)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            isSelected ? "bg-primary text-primary-foreground" : "bg-background border border-border hover-elevate"
                          }`}
                          data-testid={`button-doctype-${type.value}`}
                        >
                          <Icon className="h-4 w-4" />
                          {type.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("docs.label")}</label>
                  <Input
                    placeholder="e.g. Delta Flight to Paris"
                    value={formLabel}
                    onChange={(event) => setFormLabel(event.target.value)}
                    className="rounded-xl"
                    data-testid="input-doc-label"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("docs.reference")}</label>
                  <Input
                    placeholder="e.g. ABC123, Confirmation #"
                    value={formReference}
                    onChange={(event) => setFormReference(event.target.value)}
                    className="rounded-xl"
                    data-testid="input-doc-reference"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("docs.notes")}</label>
                  <Textarea
                    placeholder="Additional details..."
                    value={formNotes}
                    onChange={(event) => setFormNotes(event.target.value)}
                    className="rounded-xl resize-none"
                    rows={2}
                    data-testid="input-doc-notes"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Attach Document (PDF/Image)
                </label>
                <Input
                  type="file"
                  accept=".pdf,image/*,.txt,.doc,.docx"
                  onChange={handleFileChange}
                  className="rounded-xl"
                  data-testid="input-doc-attachment"
                />
                {formAttachmentName && (
                  <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{formAttachmentName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-2 py-1"
                      onClick={() => {
                        setFormAttachmentName("");
                        setFormAttachmentDataUrl("");
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              <Button type="submit" disabled={createMutation.isPending || !formLabel.trim()} className="rounded-xl" data-testid="button-submit-document">
                <Plus className="h-4 w-4 mr-2" />
                {createMutation.isPending ? "Saving..." : t("docs.save")}
              </Button>
            </form>
          )}

          {docs.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-border rounded-2xl text-muted-foreground" data-testid="text-empty-vault">
              <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-xl font-semibold mb-2">{t("docs.emptyTitle")}</h3>
              <p className="text-sm">{t("docs.emptyBody")}</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedDocs).map(([type, typeDocs]) => {
                const config = getDocTypeConfig(type);
                const Icon = config.icon;

                return (
                  <div key={type} data-testid={`section-doctype-${type}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2 rounded-xl ${config.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-bold">{config.label}s</h3>
                      <Badge variant="outline" className="ml-auto">
                        {typeDocs.length}
                      </Badge>
                    </div>

                    <div className="grid gap-3">
                      {typeDocs.map((doc) => (
                        <Card key={doc.id} className="p-4 rounded-2xl hover-elevate" data-testid={`card-document-${doc.id}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground truncate" data-testid={`text-doc-label-${doc.id}`}>
                                {doc.label}
                              </h4>

                              {doc.referenceNumber && (
                                <div className="flex items-center gap-2 mt-1.5">
                                  <code className="text-sm bg-muted px-2 py-0.5 rounded-md font-mono text-muted-foreground" data-testid={`text-doc-reference-${doc.id}`}>
                                    {doc.referenceNumber}
                                  </code>
                                  <CopyButton text={doc.referenceNumber} />
                                </div>
                              )}

                              {doc.notes && (
                                <p className="text-sm text-muted-foreground mt-2 leading-relaxed" data-testid={`text-doc-notes-${doc.id}`}>
                                  {doc.notes}
                                </p>
                              )}

                              {doc.attachmentDataUrl && (
                                <a
                                  href={doc.attachmentDataUrl}
                                  download={doc.attachmentName || `${doc.label}.pdf`}
                                  className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
                                  data-testid={`link-doc-attachment-${doc.id}`}
                                >
                                  <FileText className="h-4 w-4" />
                                  {doc.attachmentName || "Open attachment"}
                                </a>
                              )}
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(doc.id)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              data-testid={`button-delete-document-${doc.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
