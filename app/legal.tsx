import { File06 } from '@untitledui/icons/File06';
import { LinkExternal02 } from '@untitledui/icons/LinkExternal02';
import { Share07 } from '@untitledui/icons/Share07';
import { ShieldTick } from '@untitledui/icons/ShieldTick';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import {
  VerandahLayout,
  VerandahRadius,
  VerandahSpace,
  VerandahType,
} from '../constants/Verandah';
import { PRIVACY, TERMS, type LegalBlock, type LegalDocument } from '../data/legal';
import { parseInlineMarkup } from '../lib/legalMarkup';
import { goBackSmart } from '../lib/navigation';
import { shareOrCopy } from '../lib/share';
import { siteUrl } from '../lib/siteUrl';

type DocTab = 'terms' | 'privacy';

function LegalMarkupText({
  text,
  style,
  onNavigateDoc,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  onNavigateDoc?: (doc: DocTab) => void;
}) {
  const tokens = parseInlineMarkup(text);
  return (
    <Text style={style}>
      {tokens.map((token, index) => {
        if (token.type === 'text') {
          return <Text key={index}>{token.content}</Text>;
        }
        if (token.type === 'bold') {
          return (
            <Text key={index} style={styles.boldText}>
              {token.content}
            </Text>
          );
        }
        if (token.type === 'link') {
          const handlePress = () => {
            if (token.url === '/privacy') {
              onNavigateDoc?.('privacy');
            } else if (token.url === '/terms') {
              onNavigateDoc?.('terms');
            } else {
              Linking.openURL(token.url).catch(() => {});
            }
          };
          return (
            <Text key={index} onPress={handlePress} style={styles.linkText}>
              {token.text}
            </Text>
          );
        }
        return null;
      })}
    </Text>
  );
}

function LegalBlockView({
  block,
  onNavigateDoc,
}: {
  block: LegalBlock;
  onNavigateDoc: (doc: DocTab) => void;
}) {
  switch (block.kind) {
    case 'callout':
      return (
        <View style={styles.callout}>
          <LegalMarkupText
            text={block.text}
            style={styles.calloutText}
            onNavigateDoc={onNavigateDoc}
          />
        </View>
      );

    case 'para':
      return (
        <LegalMarkupText
          text={block.text}
          style={styles.paragraph}
          onNavigateDoc={onNavigateDoc}
        />
      );

    case 'subheading':
      return <Text style={styles.subheading}>{block.text}</Text>;

    case 'bullets':
      return (
        <View style={styles.bulletsContainer}>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <View style={styles.bulletTextWrap}>
                <LegalMarkupText
                  text={item}
                  style={styles.bulletText}
                  onNavigateDoc={onNavigateDoc}
                />
              </View>
            </View>
          ))}
        </View>
      );

    case 'table':
      return (
        <View style={styles.tableCard}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.tableHeadText, { flex: 1.1 }]}>{block.head[0]}</Text>
            <Text style={[styles.tableHeadText, { flex: 1.9 }]}>{block.head[1]}</Text>
          </View>
          {block.rows.map((row, rIdx) => {
            const isLast = rIdx === block.rows.length - 1;
            return (
              <View
                key={rIdx}
                style={[styles.tableRow, isLast && styles.tableRowLast]}
              >
                <View style={{ flex: 1.1, paddingRight: 8 }}>
                  <LegalMarkupText
                    text={row[0]}
                    style={styles.tableCellText}
                    onNavigateDoc={onNavigateDoc}
                  />
                </View>
                <View style={{ flex: 1.9 }}>
                  <LegalMarkupText
                    text={row[1]}
                    style={styles.tableCellSubtext}
                    onNavigateDoc={onNavigateDoc}
                  />
                </View>
              </View>
            );
          })}
        </View>
      );

    default:
      return null;
  }
}

export default function LegalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ doc?: string; returnTo?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);

  const initialDoc: DocTab = params.doc === 'privacy' ? 'privacy' : 'terms';
  const [activeDoc, setActiveDoc] = useState<DocTab>(initialDoc);

  useEffect(() => {
    if (params.doc === 'privacy') {
      setActiveDoc('privacy');
    } else if (params.doc === 'terms') {
      setActiveDoc('terms');
    }
  }, [params.doc]);

  const handleTabChange = (tab: DocTab) => {
    setActiveDoc(tab);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  };

  const currentDoc: LegalDocument = activeDoc === 'privacy' ? PRIVACY : TERMS;
  const selfPath = params.returnTo ? `/legal?returnTo=${params.returnTo}` : '/legal';

  const publicUrl = siteUrl(activeDoc === 'privacy' ? '/privacy' : '/terms');

  const openPublicPage = () => {
    Linking.openURL(publicUrl).catch(() => {});
  };

  const sharePublicPage = () => {
    shareOrCopy({ title: currentDoc.title, message: `${currentDoc.title} — Wooru\n${publicUrl}` });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HeaderBackButton
          onPress={() => goBackSmart(router, selfPath)}
          color={Verandah.textPrimary}
        />
        <Text style={styles.headerTitle}>Terms &amp; Privacy</Text>
      </View>

      {/* Segmented Control */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeDoc === 'terms' && styles.segmentActive]}
          onPress={() => handleTabChange('terms')}
          activeOpacity={0.8}
        >
          <View style={styles.segmentBtnInner}>
            <File06
              size={15}
              color={activeDoc === 'terms' ? Verandah.primary : Verandah.textSecondary}
              aria-hidden={true}
            />
            <Text
              style={[
                styles.segmentText,
                activeDoc === 'terms' && styles.segmentTextActive,
              ]}
            >
              Terms of service
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeDoc === 'privacy' && styles.segmentActive]}
          onPress={() => handleTabChange('privacy')}
          activeOpacity={0.8}
        >
          <View style={styles.segmentBtnInner}>
            <ShieldTick
              size={15}
              color={activeDoc === 'privacy' ? Verandah.primary : Verandah.textSecondary}
              aria-hidden={true}
            />
            <Text
              style={[
                styles.segmentText,
                activeDoc === 'privacy' && styles.segmentTextActive,
              ]}
            >
              Privacy policy
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.docTitle}>{currentDoc.title}</Text>
        <Text style={styles.metaText}>Last updated: {currentDoc.lastUpdated}</Text>

        {/* Intro */}
        {currentDoc.intro.map((block, idx) => (
          <LegalBlockView
            key={`intro-${idx}`}
            block={block}
            onNavigateDoc={handleTabChange}
          />
        ))}

        {/* Sections */}
        {currentDoc.sections.map((section) => (
          <View key={`sec-${section.number}`} style={styles.sectionWrap}>
            <Text style={styles.sectionHeading}>
              {section.number}. {section.heading}
            </Text>
            {section.blocks.map((block, bIdx) => (
              <LegalBlockView
                key={`sec-${section.number}-b-${bIdx}`}
                block={block}
                onNavigateDoc={handleTabChange}
              />
            ))}
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footerWrap}>
          {/* Each document also has a standalone public URL (wooru.in/terms,
              wooru.in/privacy) served as static HTML, so it can be linked from
              an app store listing, an OAuth consent screen, or a WhatsApp
              message without sending anyone through the app. */}
          <Text style={styles.footerLabel}>Public link</Text>
          <Text style={styles.footerUrl} selectable>{publicUrl}</Text>
          <View style={styles.footerActions}>
            <TouchableOpacity style={styles.footerBtn} onPress={openPublicPage} activeOpacity={0.85}>
              <LinkExternal02 size={14} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.footerBtnText}>Open in browser</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.footerBtn} onPress={sharePublicPage} activeOpacity={0.85}>
              <Share07 size={14} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.footerBtnText}>Share link</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>
            © 2026 Wooru. See also our{' '}
            <Text
              style={styles.linkText}
              onPress={() => handleTabChange(activeDoc === 'terms' ? 'privacy' : 'terms')}
            >
              {activeDoc === 'terms' ? 'Privacy Policy' : 'Terms of Service'}
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: Verandah.paper,
  },
  headerTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 24,
    lineHeight: 28,
    color: Verandah.textPrimary,
  },
  segmentContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Verandah.border,
    backgroundColor: Verandah.paper,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
  },
  segmentActive: {
    borderColor: Verandah.primary,
    backgroundColor: Verandah.surface,
  },
  segmentBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentText: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textSecondary,
  },
  segmentTextActive: {
    ...VerandahType.bodyBold,
    color: Verandah.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 96,
  },
  docTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 26,
    lineHeight: 32,
    color: Verandah.primary,
    marginBottom: 4,
  },
  metaText: {
    ...VerandahType.caption,
    fontSize: 13,
    color: Verandah.textMuted,
    marginBottom: 20,
  },
  callout: {
    backgroundColor: Verandah.cautionSoft,
    borderWidth: 1,
    borderColor: Verandah.caution,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  calloutText: {
    ...VerandahType.body,
    fontSize: 13,
    lineHeight: 19,
    color: Verandah.caution,
  },
  paragraph: {
    ...VerandahType.body,
    fontSize: 14,
    lineHeight: 22,
    color: Verandah.textSecondary,
    marginBottom: 14,
  },
  boldText: {
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  linkText: {
    color: Verandah.accent,
    textDecorationLine: 'underline',
  },
  sectionWrap: {
    marginTop: 20,
  },
  sectionHeading: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 18,
    lineHeight: 24,
    color: Verandah.primary,
    marginTop: 12,
    marginBottom: 12,
  },
  subheading: {
    ...VerandahType.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: Verandah.textPrimary,
    marginTop: 14,
    marginBottom: 8,
  },
  bulletsContainer: {
    marginBottom: 14,
    paddingLeft: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Verandah.textSecondary,
    marginTop: 8,
    marginRight: 10,
  },
  bulletTextWrap: {
    flex: 1,
  },
  bulletText: {
    ...VerandahType.body,
    fontSize: 14,
    lineHeight: 21,
    color: Verandah.textSecondary,
  },
  tableCard: {
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.border,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 16,
  },
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: Verandah.cardMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Verandah.border,
  },
  tableHeadText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Verandah.border,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCellText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    color: Verandah.textPrimary,
  },
  tableCellSubtext: {
    ...VerandahType.body,
    fontSize: 13,
    lineHeight: 18,
    color: Verandah.textSecondary,
  },
  footerWrap: {
    borderTopWidth: 1,
    borderTopColor: Verandah.border,
    marginTop: 32,
    paddingTop: 20,
  },
  footerLabel: {
    ...VerandahType.sectionLabel,
    color: Verandah.textTertiary,
    marginBottom: 4,
  },
  footerUrl: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    color: Verandah.primary,
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 18,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Verandah.card,
  },
  footerBtnText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '600',
    color: Verandah.primary,
  },
  footerText: {
    ...VerandahType.caption,
    fontSize: 13,
    color: Verandah.textMuted,
  },
});
