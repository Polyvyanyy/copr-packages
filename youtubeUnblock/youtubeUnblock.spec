%undefine _disable_source_fetch
%global commit 477304ab53252c9bdd8911b97fa5f6187744a2e4
%global shortcommit %(c=%{commit}; echo ${c:0:7})
%global git_rel .git%{shortcommit}

Name:           youtubeUnblock
Version:		0.1.0
Release:		5%{?git_rel}%{?dist}
Summary:		Bypasses Googlevideo detection systems that relies on SNI
License:		GPL-3.0
Group:          Productivity

Url:			https://github.com/Waujito/youtubeUnblock
Source:			%{url}/archive/%{commit}/%{name}-main-%{commit}.tar.gz

BuildRequires:	gcc-c++
BuildRequires:	autoconf
BuildRequires:	libtool
BuildRequires:	make
BuildRequires:	automake
BuildRequires:	pkg-config
BuildRequires:	systemd-rpm-macros
BuildRequires:	glibc-static

%description

Bypasses Googlevideo detection systems that relies on SNI.



%prep
%autosetup -n %{name}-%{commit} -p1
sed -i 's|$(PREFIX)/bin/youtubeUnblock|/usr/bin/youtubeUnblock|' youtubeUnblock.service


%build
%make_build

%install
make install PREFIX=%{buildroot}/usr

%files
%{_bindir}/%{name}
%{_unitdir}/%{name}.service

%changelog

