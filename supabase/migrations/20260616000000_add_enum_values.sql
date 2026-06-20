-- Migration: Add president and vice_president enum values
ALTER TYPE public.app_role_type ADD VALUE IF NOT EXISTS 'president';
ALTER TYPE public.app_role_type ADD VALUE IF NOT EXISTS 'vice_president';
