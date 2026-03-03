import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, FileText, Plane, Building2, BookOpen, Shield, FolderOpen,
  Plus, Trash2, Copy, Check, Edit3, X
} from "lucide-react";
import { useTrip } from "@/hooks/use-trips";
import { useDocuments, useCreateDocument, useDeleteDocument } from "@/hooks/use-documents";
import { NavBar } from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TravelDocument } from "@shared/schema";

const DOC_TYPES = [
  { value: "flight", label: "Flight", icon: Plane, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { value: "hotel", label: "Hotel", icon: Building2, color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  { value: "passport", label: "Passport", icon: BookOpen, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { value: "insurance", label: "Insurance", icon: Shield, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "other", label: "Other", icon: FileText, color: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
];

function getDocTypeConfig(type: string) {
  return DOC_TYPES.find(d => d.value === type) || DOC_TYPES[4];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleCopy}
      data-testid="button-copy-reference"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export default function DocumentVault() {
  const [, params] = useRoute("/trips/:id/documents");
  const tripId = parseInt(params?.id || "0", 10);

  const { data: trip, isLoading: isLoadingTrip } = useTrip(tripId);
  const { data: documents, isLoading: isLoadingDocs } = useDocuments(tripId);

  const createMutation = useCreateDocument();
  const deleteMutation = useDeleteDocument();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formDocType, setFormDocType] = useState("flight");
  const [formLabel, setFormLabel] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLabel.trim()) return;
    createMutation.mutate(
      {
        tripId,
        docType: formDocType,
        label: formLabel.trim(),
        referenceNumber: formReference.trim() || null,
        notes: formNotes.trim() || null,
      },
      {
        onSuccess: () => {
          setFormLabel("");
          setFormReference("");
          setFormNotes("");
          setFormDocType("flight");
          setIsFormOpen(false);
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id, tripId });
  };

  const docs = (documents as TravelDocument[]) || [];

  const groupedDocs = DOC_TYPES.reduce<Record<string, TravelDocument[]>>((acc, type) => {
    const filtered = docs.filter(d => d.docType === type.value);
    if (filtered.length > 0) {
      acc[type.value] = filtered;
    }
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <NavBar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/trips/${trip.id}`}
          className="inline-flex items-center text-muted-foreground hover:text-primary mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Link>

        <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-secondary/10 rounded-2xl text-secondary">
                <FolderOpen className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground" data-testid="text-vault-title">Document Vault</h1>
                <p className="text-muted-foreground font-medium mt-1">for {trip.destination}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="secondary" data-testid="text-doc-count">
                {docs.length} {docs.length === 1 ? "document" : "documents"}
              </Badge>
              <Button
                onClick={() => setIsFormOpen(!isFormOpen)}
                className="rounded-xl"
                data-testid="button-add-document"
              >
                {isFormOpen ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {isFormOpen ? "Cancel" : "Add Document"}
              </Button>
            </div>
          </div>

          {isFormOpen && (
            <form onSubmit={handleSubmit} className="mb-8 bg-muted/30 rounded-2xl p-6 border border-border/50" data-testid="form-add-document">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Edit3 className="h-5 w-5" /> New Document
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Document Type</label>
                  <div className="flex flex-wrap gap-2">
                    {DOC_TYPES.map(type => {
                      const Icon = type.icon;
                      const isSelected = formDocType === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setFormDocType(type.value)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-background border border-border hover-elevate"
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Label</label>
                  <Input
                    placeholder="e.g. Delta Flight to Paris"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    className="rounded-xl"
                    data-testid="input-doc-label"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Reference Number</label>
                  <Input
                    placeholder="e.g. ABC123, Confirmation #"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="rounded-xl"
                    data-testid="input-doc-reference"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Notes</label>
                  <Textarea
                    placeholder="Additional details..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="rounded-xl resize-none"
                    rows={2}
                    data-testid="input-doc-notes"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={createMutation.isPending || !formLabel.trim()}
                className="rounded-xl"
                data-testid="button-submit-document"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createMutation.isPending ? "Saving..." : "Save Document"}
              </Button>
            </form>
          )}

          {docs.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-border rounded-2xl text-muted-foreground" data-testid="text-empty-vault">
              <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-xl font-semibold mb-2">No documents yet</h3>
              <p className="text-sm">Add your travel documents like flight bookings, hotel reservations, and passport info.</p>
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
                      {typeDocs.map(doc => (
                        <Card
                          key={doc.id}
                          className="p-4 rounded-2xl hover-elevate"
                          data-testid={`card-document-${doc.id}`}
                        >
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
